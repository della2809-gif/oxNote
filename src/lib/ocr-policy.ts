import type { ProcessingIssue } from "./types";

export const OCR_CONFIDENCE = {
  AUTO_ACCEPT: 0.95,
  AI_REVIEW: 0.8,
} as const;

const latexWrapperPatterns = [
  /^\$\$([\s\S]*)\$\$$/,
  /^\$([\s\S]*)\$$/,
  /^\\\[([\s\S]*)\\\]$/,
  /^\\\(([\s\S]*)\\\)$/,
];

export function normalizeLatex(value: string) {
  let normalized = value.trim();
  for (const pattern of latexWrapperPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      normalized = match[1].trim();
      break;
    }
  }
  return normalized
    .replace(/\\\\(?=(?:d?frac|sqrt|times|cdot|lim|sum|int|log|left|right|begin|end))/g, "\\")
    .replace(/[−–—]/g, "-");
}

export function normalizeConfidence(value: unknown) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return 0.5;
  return Math.max(0, Math.min(1, confidence));
}

export function recognitionDisposition(confidence: number) {
  if (confidence >= OCR_CONFIDENCE.AUTO_ACCEPT) return "auto_accept" as const;
  if (confidence >= OCR_CONFIDENCE.AI_REVIEW) return "ai_review" as const;
  return "retry_or_user_review" as const;
}

export function normalizeProcessingIssues(value: unknown): ProcessingIssue[] {
  const allowed = new Set<ProcessingIssue>([
    "text_ocr_error",
    "math_ocr_error",
    "layout_error",
    "passage_link_error",
    "table_parse_error",
    "vision_validation_error",
    "parsing_error",
    "solution_error",
  ]);
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((issue): issue is ProcessingIssue => allowed.has(issue as ProcessingIssue))));
}
