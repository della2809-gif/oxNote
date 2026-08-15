import "server-only";

import sharp from "sharp";
import { getOpenAI, GPT_FAST_MODEL, OPENAI_IMAGE_DETAIL } from "./openai";
import {
  normalizeConfidence,
  normalizeLatex,
  normalizeProcessingIssues,
  recognitionDisposition,
} from "./ocr-policy";
import type { DocumentRecognition } from "./types";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const DOCUMENT_RECOGNITION_SCHEMA = {
  type: "object",
  properties: {
    raw_ocr_text: { type: "string", description: "첫 판독 결과. 문제를 풀거나 자연스럽게 고쳐 쓰지 않음" },
    corrected_text: { type: "string", description: "원본과 대조해 명백한 OCR 오류만 교정한 문제 전문" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    has_math: { type: "boolean" },
    needs_review: { type: "boolean" },
    warnings: { type: "array", items: { type: "string" } },
    processing_issues: {
      type: "array",
      items: {
        type: "string",
        enum: ["text_ocr_error", "math_ocr_error", "layout_error", "passage_link_error", "table_parse_error", "vision_validation_error", "parsing_error"],
      },
    },
    math_expressions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          raw: { type: "string" },
          latex: { type: "string", description: "wrapper 없는 순수 LaTeX" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["raw", "latex", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["raw_ocr_text", "corrected_text", "confidence", "has_math", "needs_review", "warnings", "processing_issues", "math_expressions"],
  additionalProperties: false,
} as const;

function pdfSourceKind(input: Buffer): DocumentRecognition["sourceKind"] {
  const sample = input.subarray(0, Math.min(input.length, 2_000_000)).toString("latin1");
  const textOperators = (sample.match(/(?:\bBT\b|\bTj\b|\bTJ\b)/g) ?? []).length;
  return textOperators >= 3 ? "pdf_text_candidate" : "pdf_scanned_or_unknown";
}

async function preprocessImage(input: Buffer) {
  return sharp(input, { failOn: "none", limitInputPixels: 45_000_000 })
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .greyscale()
    .normalise({ lower: 1, upper: 99 })
    .sharpen({ sigma: 0.45 })
    .webp({ quality: 92, effort: 3 })
    .toBuffer();
}

export async function recognizeAndVerifyDocument({
  input,
  mimeType,
  filename,
  subject,
  signal,
}: {
  input: Buffer;
  mimeType: string;
  filename: string;
  subject?: string;
  signal?: AbortSignal;
}): Promise<{ recognition: DocumentRecognition; usage: { inputTokens: number; outputTokens: number } }> {
  const sourceKind: DocumentRecognition["sourceKind"] = mimeType === "application/pdf"
    ? pdfSourceKind(input)
    : "image";
  const originalBase64 = input.toString("base64");
  const preprocessed = IMAGE_TYPES.has(mimeType) ? await preprocessImage(input) : null;
  const fileContent = mimeType === "application/pdf"
    ? [{ type: "input_file" as const, filename, file_data: `data:application/pdf;base64,${originalBase64}` }]
    : [
        { type: "input_image" as const, image_url: `data:${mimeType};base64,${originalBase64}`, detail: OPENAI_IMAGE_DETAIL },
        ...(preprocessed
          ? [{ type: "input_image" as const, image_url: `data:image/webp;base64,${preprocessed.toString("base64")}`, detail: OPENAI_IMAGE_DETAIL }]
          : []),
      ];

  const response = await getOpenAI().responses.create({
    model: GPT_FAST_MODEL,
    input: [
      {
        role: "system",
        content: [
          "너는 한국 시험지 OCR 검증기다. 첫 번째 첨부는 원본이며 두 번째 이미지가 있으면 읽기 보조용 전처리본이다.",
          "먼저 원본을 그대로 판독해 raw_ocr_text를 만들고, 원본과 다시 비교해 명백한 OCR 오류만 corrected_text에서 수정한다.",
          "문제를 풀거나 정답을 추론하지 말고, 문맥상 자연스럽다는 이유로 내용을 바꾸거나 새 문제를 만들지 않는다.",
          "한글, 숫자, 소수점, 부호, 괄호, 위첨자, 아래첨자, 분수, 루트 범위, 문제·선택지 번호, 단위, 좌표, 표 숫자, 그래프 축 값을 확인한다.",
          "불확실한 문자는 [판독 불확실]로 남기고 confidence를 낮추며 needs_review=true로 반환한다.",
          "수식은 corrected_text에서 \\(...\\)로 감싸고 math_expressions에는 raw와 wrapper 없는 순수 LaTeX를 함께 반환한다.",
          "LaTeX는 \\frac{}{}, ^{}, _{}, \\sqrt{}, \\lim, \\sum, \\int 구조를 보존한다.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          ...fileContent,
          { type: "input_text" as const, text: `${subject ? `과목 힌트: ${subject}\n` : ""}파일 유형 후보: ${sourceKind}. OCR 검증 결과만 schema로 반환하세요.` },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "verified_document_recognition",
        strict: true,
        schema: DOCUMENT_RECOGNITION_SCHEMA,
      },
    },
  }, { signal });

  const parsed = JSON.parse(response.output_text || "{}");
  const confidence = normalizeConfidence(parsed.confidence);
  const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.map(String).filter(Boolean).slice(0, 20) : [];
  const processingIssues = normalizeProcessingIssues(parsed.processing_issues);
  const needsReview = Boolean(parsed.needs_review) || recognitionDisposition(confidence) !== "auto_accept";
  const rawOcrText = String(parsed.raw_ocr_text ?? "").trim();
  const correctedText = String(parsed.corrected_text ?? rawOcrText).trim();
  return {
    recognition: {
      version: 1,
      sourceKind,
      rawOcrText,
      correctedText,
      confidence,
      hasMath: Boolean(parsed.has_math),
      needsReview,
      correctionApplied: rawOcrText !== correctedText,
      visionVerified: true,
      warnings,
      processingIssues,
      mathExpressions: Array.isArray(parsed.math_expressions)
        ? parsed.math_expressions.slice(0, 50).map((expression: { raw?: unknown; latex?: unknown; confidence?: unknown }) => ({
            raw: String(expression.raw ?? ""),
            latex: normalizeLatex(String(expression.latex ?? "")) || undefined,
            confidence: normalizeConfidence(expression.confidence),
          }))
        : [],
    },
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    },
  };
}
