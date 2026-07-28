import { getOpenAI, GPT_MODEL } from "./openai";
import type { NoteAiDetails } from "./types";

export type TextAnalysisResult = {
  analysis: string;
  mistakeType: string;
  tags: string[];
  succeeded: boolean;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
};

export type FileAnalysisResult = TextAnalysisResult & {
  question: string;
  myAnswer: string;
  correctAnswer: string;
  details: NoteAiDetails;
};

const TUTOR_INSTRUCTIONS =
  "너는 모든 시험 분야를 다루는 한국어 AI 오답 튜터야. 문제의 유형과 교육과정, 난이도, " +
  "핵심 개념을 판별하고 학생 눈높이에 맞춰 단계별 풀이를 작성해. 학생 풀이가 첨부되면 실제로 " +
  "잘못된 지점을 근거로 혼동 포인트를 찾고, 없으면 문제에서 흔히 발생하는 예상 혼동 지점을 알려줘. " +
  "과목과 시험 영역은 발문에 쓰인 언어가 아니라 실제로 평가하는 지식과 본문을 기준으로 판별해. " +
  "특히 영어 지문의 독해·어휘·어법을 묻는 문제는 발문, 선택지 번호, 학생 필기나 해설이 한국어여도 " +
  "영어로 분류하고, 한국어로 번역된 외국어 지문이 아니라면 국어로 분류하지 마. " +
  "수식은 읽기 쉬운 일반 텍스트로 쓰고 확인할 수 없는 개인정보는 추측하지 마. mistake_type은 " +
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
    details: {
      type: "object",
      properties: {
        title: { type: "string", description: "문제를 한 문장으로 요약한 제목" },
        subject: {
          type: "string",
          description:
            "사용자 과목 분류에 사용할 간결한 과목명. 예: 국어, 영어, 수학, 과학, 사회, 한국사, 컴퓨터활용능력, NCS",
        },
        grade_level: { type: "string", description: "예: 중2, 고1, 공무원 9급, 토익" },
        curriculum: {
          type: "string",
          description:
            "화면에 표시할 실제 과목 또는 시험 영역. 본문과 평가 지식을 우선하며, 영어 지문 독해·어휘·어법 문제는 한국어 발문이나 필기가 있어도 반드시 '영어'로 작성",
        },
        difficulty: { type: "string", description: "하, 중하, 중, 중상, 상 중 하나" },
        question_type: { type: "string", description: "문제 유형을 짧게 요약" },
        core_concepts: {
          type: "array",
          items: { type: "string" },
          description: "이 문제를 풀기 위한 핵심 개념",
        },
        solution_steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "단계 제목" },
              explanation: { type: "string", description: "학생 눈높이의 설명" },
              formula: { type: "string", description: "해당 단계의 계산 또는 핵심 문장" },
            },
            required: ["title", "explanation", "formula"],
            additionalProperties: false,
          },
          description: "순서대로 따라가는 2~6개의 풀이 단계",
        },
        answer_summary: { type: "string", description: "최종 정답과 결론" },
        confusion_points: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "틀리기 쉬운 지점" },
              explanation: { type: "string", description: "왜 헷갈리는지" },
              correction: { type: "string", description: "다음에 적용할 교정 방법" },
            },
            required: ["title", "explanation", "correction"],
            additionalProperties: false,
          },
          description: "실제 또는 예상 혼동 지점 2~5개",
        },
      },
      required: [
        "title",
        "subject",
        "grade_level",
        "curriculum",
        "difficulty",
        "question_type",
        "core_concepts",
        "solution_steps",
        "answer_summary",
        "confusion_points",
      ],
      additionalProperties: false,
    },
  },
  required: [
    "question",
    "student_answer",
    "correct_answer",
    "analysis",
    "mistake_type",
    "tags",
    "details",
  ],
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
    const response = await getOpenAI().responses.create({
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
      succeeded: true,
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      },
    };
  } catch (err) {
    // AI 분석이 실패해도 노트 자체는 저장되어야 하므로 빈 결과로 대체한다.
    console.error("analyzeFromText failed:", err);
    return {
      analysis: "",
      mistakeType: "",
      tags: [],
      succeeded: false,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}

export async function analyzeFromFile({
  fileBase64,
  mimeType,
  filename,
  subject,
  myAnswerHint,
  correctAnswerHint,
  studentSolutionBase64,
  studentSolutionMimeType,
  studentSolutionFilename,
}: {
  fileBase64: string;
  mimeType: string;
  filename: string;
  subject: string;
  myAnswerHint: string;
  correctAnswerHint: string;
  studentSolutionBase64?: string;
  studentSolutionMimeType?: string;
  studentSolutionFilename?: string;
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

  const studentSolutionContent =
    studentSolutionBase64 && studentSolutionMimeType
      ? studentSolutionMimeType === "application/pdf"
        ? {
            type: "input_file" as const,
            filename: studentSolutionFilename || "student-solution.pdf",
            file_data: `data:application/pdf;base64,${studentSolutionBase64}`,
          }
        : {
            type: "input_image" as const,
            image_url: `data:${studentSolutionMimeType};base64,${studentSolutionBase64}`,
            detail: "auto" as const,
          }
      : null;

  const hintLines = [
    subject ? `과목: ${subject}` : null,
    "첨부된 이미지 또는 PDF에서 문제와 학생의 답, 정답을 읽어내고 오답 원인을 분석해줘.",
    studentSolutionContent
      ? "두 번째 첨부 파일은 학생의 실제 풀이야. 표시된 계산과 문장을 근거로 실제 오류 지점을 찾아줘."
      : "학생 풀이 파일은 없어. confusion_points에는 이 문제에서 자주 생기는 예상 혼동 지점을 작성해줘.",
    myAnswerHint ? `학생이 직접 알려준 자신의 답: ${myAnswerHint}` : null,
    correctAnswerHint ? `학생이 직접 알려준 정답: ${correctAnswerHint} (파일 내용보다 이 값을 우선해)` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await getOpenAI().responses.create({
    model: GPT_MODEL,
    input: [
      { role: "system", content: TUTOR_INSTRUCTIONS },
      {
        role: "user",
        content: [
          fileContent,
          ...(studentSolutionContent ? [studentSolutionContent] : []),
          { type: "input_text" as const, text: hintLines },
        ],
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
  const details = parsed.details ?? {};
  return {
    question: parsed.question ?? "",
    myAnswer: parsed.student_answer ?? "",
    correctAnswer: parsed.correct_answer ?? "",
    analysis: parsed.analysis ?? "",
    mistakeType: parsed.mistake_type ?? "",
    tags: parsed.tags ?? [],
    details: {
      title: details.title ?? "",
      subject: details.subject ?? "",
      gradeLevel: details.grade_level ?? "",
      curriculum: details.curriculum ?? "",
      difficulty: details.difficulty ?? "",
      questionType: details.question_type ?? "",
      coreConcepts: details.core_concepts ?? [],
      solutionSteps: (details.solution_steps ?? []).map(
        (step: { title?: string; explanation?: string; formula?: string }) => ({
          title: step.title ?? "",
          explanation: step.explanation ?? "",
          formula: step.formula ?? "",
        }),
      ),
      answerSummary: details.answer_summary ?? "",
      confusionPoints: (details.confusion_points ?? []).map(
        (point: { title?: string; explanation?: string; correction?: string }) => ({
          title: point.title ?? "",
          explanation: point.explanation ?? "",
          correction: point.correction ?? "",
        }),
      ),
    },
    succeeded: true,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    },
  };
}
