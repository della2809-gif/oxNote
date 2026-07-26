import { openai, GPT_MODEL } from "./openai";

export type TextAnalysisResult = {
  analysis: string;
  mistakeType: string;
  tags: string[];
};

export type FileAnalysisResult = TextAnalysisResult & {
  question: string;
  myAnswer: string;
  correctAnswer: string;
};

const TUTOR_INSTRUCTIONS =
  "너는 학생의 시험 오답을 분석해주는 튜터야. 왜 틀렸는지 원인을 분석하고, " +
  "다시 틀리지 않기 위한 학습 포인트를 한국어로 설명해. mistake_type은 " +
  "'개념 이해 부족', '계산 실수', '문제 오독', '암기 부족' 등으로 짧게 요약하고, " +
  "tags는 문제와 관련된 핵심 개념 키워드 배열로 만들어.";

const TEXT_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    analysis: { type: "string", description: "왜 틀렸는지와 핵심 개념 설명 (3~5문장)" },
    mistake_type: { type: "string", description: "오류 유형을 짧게 요약" },
    tags: { type: "array", items: { type: "string" }, description: "관련 핵심 개념 키워드" },
  },
  required: ["analysis", "mistake_type", "tags"],
  additionalProperties: false,
};

const FILE_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    question: { type: "string", description: "파일에서 읽어낸 문제 전문" },
    student_answer: { type: "string", description: "파일에서 확인되는 학생의 답. 없으면 빈 문자열" },
    correct_answer: { type: "string", description: "정답. 파일이나 힌트로 확인되지 않으면 최선의 추정 정답" },
    analysis: { type: "string", description: "왜 틀렸는지와 핵심 개념 설명 (3~5문장)" },
    mistake_type: { type: "string", description: "오류 유형을 짧게 요약" },
    tags: { type: "array", items: { type: "string" }, description: "관련 핵심 개념 키워드" },
  },
  required: ["question", "student_answer", "correct_answer", "analysis", "mistake_type", "tags"],
  additionalProperties: false,
};

function extractOutputText(response: { output_text?: string }): string {
  return response.output_text ?? "{}";
}

export async function analyzeFromText({
  question,
  myAnswer,
  correctAnswer,
  subject,
}: {
  question: string;
  myAnswer: string;
  correctAnswer: string;
  subject: string;
}): Promise<TextAnalysisResult> {
  try {
    const response = await openai.responses.create({
      model: GPT_MODEL,
      input: [
        { role: "system", content: TUTOR_INSTRUCTIONS },
        {
          role: "user",
          content: [
            subject ? `과목: ${subject}` : null,
            `문제: ${question}`,
            `학생 답: ${myAnswer || "(무응답)"}`,
            `정답: ${correctAnswer}`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "mistake_analysis",
          strict: true,
          schema: TEXT_ANALYSIS_SCHEMA,
        },
      },
    });

    const parsed = JSON.parse(extractOutputText(response));
    return {
      analysis: parsed.analysis ?? "",
      mistakeType: parsed.mistake_type ?? "",
      tags: parsed.tags ?? [],
    };
  } catch {
    // AI 분석이 실패해도 노트 자체는 저장되어야 하므로 빈 결과로 대체한다.
    return { analysis: "", mistakeType: "", tags: [] };
  }
}

export async function analyzeFromFile({
  fileBase64,
  mimeType,
  filename,
  subject,
  myAnswerHint,
  correctAnswerHint,
}: {
  fileBase64: string;
  mimeType: string;
  filename: string;
  subject: string;
  myAnswerHint: string;
  correctAnswerHint: string;
}): Promise<FileAnalysisResult> {
  const fileContent =
    mimeType === "application/pdf"
      ? {
          type: "input_file" as const,
          filename,
          file_data: `data:application/pdf;base64,${fileBase64}`,
        }
      : {
          type: "input_image" as const,
          image_url: `data:${mimeType};base64,${fileBase64}`,
          detail: "auto" as const,
        };

  const hintLines = [
    subject ? `과목: ${subject}` : null,
    "첨부된 이미지 또는 PDF에서 문제와 학생의 답, 정답을 읽어내고 오답 원인을 분석해줘.",
    myAnswerHint ? `학생이 직접 알려준 자신의 답: ${myAnswerHint}` : null,
    correctAnswerHint ? `학생이 직접 알려준 정답: ${correctAnswerHint} (파일 내용보다 이 값을 우선해)` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await openai.responses.create({
    model: GPT_MODEL,
    input: [
      { role: "system", content: TUTOR_INSTRUCTIONS },
      {
        role: "user",
        content: [fileContent, { type: "input_text" as const, text: hintLines }],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "mistake_analysis_from_file",
        strict: true,
        schema: FILE_ANALYSIS_SCHEMA,
      },
    },
  });

  const parsed = JSON.parse(extractOutputText(response));
  return {
    question: parsed.question ?? "",
    myAnswer: parsed.student_answer ?? "",
    correctAnswer: parsed.correct_answer ?? "",
    analysis: parsed.analysis ?? "",
    mistakeType: parsed.mistake_type ?? "",
    tags: parsed.tags ?? [],
  };
}
