import {
  getOpenAI,
  GPT_FAST_MODEL,
  GPT_FILE_MODEL,
  OPENAI_FILE_REASONING_EFFORT,
  OPENAI_FILE_VERBOSITY,
  OPENAI_IMAGE_DETAIL,
} from "./openai";
import {
  applyMathVerificationCorrections,
  verifyAndCorrectMathDetails,
} from "./math-verifier";
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

export type HandwritingRecognitionResult = {
  recognizedText: string;
  latex: string;
  confidence: "low" | "medium" | "high";
  warnings: string[];
  succeeded: boolean;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
};

export type AnalysisStreamUpdate = {
  delta: string;
  outputText: string;
  elapsedMs: number;
};

type AnalysisRuntimeOptions = {
  signal?: AbortSignal;
  onDelta?: (update: AnalysisStreamUpdate) => void;
  onFirstToken?: (elapsedMs: number) => void;
};

const TUTOR_INSTRUCTIONS = `너는 모든 시험 분야를 다루는 한국어 AI 오답 튜터다.

목표
1. 첨부된 원본에서 인쇄된 문제, 수치, 단위, 도형 표기를 먼저 정확히 판독한다.
2. 학생의 답이나 필기를 보기 전에 문제를 처음부터 독립적으로 풀어 정답을 확정한다.
3. 학생 풀이가 있으면 독립 풀이와 비교해 처음 어긋난 단계와 이유를 찾는다.
4. 학생이 그대로 따라갈 수 있는 완전한 정답 풀이와 학습 수준 분석을 제공한다.

판독 원칙
- 사진의 빨간 채점선, 손글씨, 책 뒤쪽 비침은 인쇄된 문제 조건과 구분한다.
- problem_region은 인쇄된 현재 문제의 번호·본문·보기·도형을 모두 포함하고, 주변의 다른 문제·손글씨·채점 표시·불필요한 여백은 제외한다. 좌표는 이미지 전체를 가로·세로 각각 1000으로 정규화해 반환한다.
- 대분수의 정수부·분자·분모, 소수점, 음수 부호, 지수, 괄호, 도형의 밑변·높이·가로·세로와 단위를 빠짐없이 읽는다.
- 불명확한 값은 문맥으로 임의 확정하지 말고 해당 값을 recognized_conditions에 '판독 불확실'이라고 표시한다.
- 과목은 발문의 언어가 아니라 실제 평가 지식으로 판별한다. 영어 지문 독해·어휘·어법 문제는 한국어 발문이나 필기가 있어도 영어다.

풀이 원칙
- question에는 조건과 질문을 포함한 문제 전문을 복원한다.
- 수학은 사용 개념과 공식을 먼저 밝힌 뒤, 각 도형·식·경우를 분리하여 3~8단계로 계산하고 마지막에 요구한 값과 단위를 확인한다.
- 넓이 비교 문제라면 각 도형의 넓이를 각각 구한 뒤 큰 값에서 작은 값을 빼고 어느 도형이 얼마나 더 넓은지 답한다.
- 대분수는 가분수로 바꾸는 식을 명시한다. 분수 계산은 약분된 정확한 분수와 필요하면 대분수를 함께 쓴다.
- 방정식은 조건 대입, 식 변형, 해의 범위 확인, 원래 식 대입 검산을 포함한다.
- 단위가 있는 값은 모든 핵심 계산에 단위를 유지하고 차원이 맞는지 확인한다.
- formula에는 '계산식 = 중간값 = 최종값 단위'를 일반 텍스트로 쓴다. 정확히 같은 값에만 =를 쓰고 근삿값에는 ≈를 쓴다.
- answer_summary는 질문에 직접 답하는 완전한 한국어 문장으로 쓴다.

학습 분석 원칙
- grade_level은 대한민국 교육과정 기준의 학교급·학년·가능하면 학기까지 제시하고, 확신이 낮으면 범위로 쓴다.
- learning_elements에는 문제 해결에 실제로 사용한 개념, 학생 눈높이 설명, 일반적으로 배우는 시기를 적는다.
- difficulty는 하·중하·중·중상·상 중 하나로 쓰고, 계산 단계와 오답 가능성을 근거로 설명한다.
- 학생 풀이가 없으면 틀렸다고 단정하지 않고 confusion_points에 예상 혼동 지점을 쓴다.
- 학생 풀이가 있으면 맞는 부분을 인정하고 실제 처음 오류가 난 지점을 근거로 설명한다.
- 확인할 수 없는 개인정보나 출처는 추측하지 않는다.
- mistake_type은 '개념 이해 부족', '계산 실수', '문제 오독', '암기 부족'처럼 짧게, tags는 핵심 개념 키워드 배열로 작성한다.`;

const TEXT_TUTOR_INSTRUCTIONS = `너는 한국어 AI 오답 튜터다.
- 문제, 학생 답, 정답의 차이만 근거로 첫 오류 원인과 핵심 개념을 3~5문장으로 설명한다.
- 맞았지만 복습인 문제는 틀렸다고 단정하지 않고 풀이 점검과 복습 지점을 설명한다.
- mistake_type은 '개념 이해 부족', '계산 실수', '문제 오독', '암기 부족'처럼 짧게 쓴다.
- tags에는 실제 풀이에 필요한 핵심 개념만 넣고 개인정보나 확인할 수 없는 사실은 추측하지 않는다.`;

const usesFileGpt5 = GPT_FILE_MODEL.startsWith("gpt-5");
const usesFastGpt5 = GPT_FAST_MODEL.startsWith("gpt-5");

function reasoningRequestOptions() {
  return usesFileGpt5
    ? {
        reasoning: { effort: OPENAI_FILE_REASONING_EFFORT },
      }
    : {};
}

function fastRequestOptions() {
  return usesFastGpt5 ? { reasoning: { effort: "none" as const } } : {};
}

async function collectStream(
  stream: AsyncIterable<unknown>,
  options: AnalysisRuntimeOptions,
) {
  const startedAt = performance.now();
  let outputText = "";
  let firstTokenSeen = false;
  let inputTokens = 0;
  let outputTokens = 0;

  for await (const rawEvent of stream) {
    const event = rawEvent as {
      type?: string;
      delta?: string;
      response?: {
        usage?: { input_tokens?: number; output_tokens?: number } | null;
      };
    };
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      if (!firstTokenSeen) {
        firstTokenSeen = true;
        options.onFirstToken?.(performance.now() - startedAt);
      }
      outputText += event.delta;
      options.onDelta?.({
        delta: event.delta,
        outputText,
        elapsedMs: performance.now() - startedAt,
      });
    }
    if (event.type === "response.completed") {
      inputTokens = event.response?.usage?.input_tokens ?? 0;
      outputTokens = event.response?.usage?.output_tokens ?? 0;
    }
  }

  return { outputText, usage: { inputTokens, outputTokens } };
}

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

const HANDWRITING_RECOGNITION_SCHEMA = {
  type: "object",
  properties: {
    recognized_text: {
      type: "string",
      description: "손글씨에서 읽은 문제 전문. 줄바꿈, 보기, 단위와 수식을 보존",
    },
    latex: {
      type: "string",
      description: "수학 수식이 있으면 LaTeX로 정규화한 표현. 수식이 없으면 빈 문자열",
    },
    confidence: {
      type: "string",
      enum: ["low", "medium", "high"],
      description: "전체 판독 신뢰도",
    },
    warnings: {
      type: "array",
      items: { type: "string" },
      description: "판독이 불확실한 기호나 영역. 없으면 빈 배열",
    },
  },
  required: ["recognized_text", "latex", "confidence", "warnings"],
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
        recognized_conditions: {
          type: "array",
          items: { type: "string" },
          description: "원본에서 판독한 수치, 단위, 도형 조건과 질문을 계산 전 체크리스트 형태로 정리",
        },
        problem_region: {
          type: "object",
          properties: {
            x: { type: "number", description: "이미지 전체 너비를 1000으로 보았을 때 문제 영역의 왼쪽 좌표" },
            y: { type: "number", description: "이미지 전체 높이를 1000으로 보았을 때 문제 영역의 위쪽 좌표" },
            width: { type: "number", description: "이미지 전체 너비를 1000으로 보았을 때 문제 영역 너비" },
            height: { type: "number", description: "이미지 전체 높이를 1000으로 보았을 때 문제 영역 높이" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
          },
          required: ["x", "y", "width", "height", "confidence"],
          additionalProperties: false,
          description: "인쇄된 한 문제 전체를 포함하되 주변 문제·여백·필기를 제외한 경계 상자",
        },
        learning_elements: {
          type: "array",
          items: {
            type: "object",
            properties: {
              concept: { type: "string", description: "학습 개념명" },
              explanation: { type: "string", description: "이 문제에서 개념을 어떻게 사용하는지" },
              learning_stage: { type: "string", description: "대한민국 교육과정에서 일반적으로 배우는 학교급·학년·학기" },
            },
            required: ["concept", "explanation", "learning_stage"],
            additionalProperties: false,
          },
          description: "실제 풀이에 사용한 학습 요소 2~5개",
        },
        grade_rationale: {
          type: "string",
          description: "판별한 학교급·학년의 근거. 교육과정 개념과 계산 요구를 연결해 2~4문장으로 설명",
        },
        difficulty_rationale: {
          type: "string",
          description: "난이도의 근거. 풀이 단계, 계산 부담, 자주 발생하는 실수를 연결해 2~4문장으로 설명",
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
          description:
            "순서대로 따라가는 3~8개의 완전한 정답 풀이 단계. 사용 공식, 조건 변환, 각 대상의 계산, 비교·결론과 검산을 생략하지 않음",
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
        "recognized_conditions",
        "problem_region",
        "learning_elements",
        "grade_rationale",
        "difficulty_rationale",
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

export async function analyzeFromText({
  question,
  myAnswer,
  correctAnswer,
  subject,
  learningStatus = "incorrect",
  runtime = {},
}: {
  question: string;
  myAnswer: string;
  correctAnswer: string;
  subject: string;
  learningStatus?: "incorrect" | "correct_review";
  runtime?: AnalysisRuntimeOptions;
}): Promise<TextAnalysisResult> {
  try {
    const stream = await getOpenAI().responses.create({
      model: GPT_FAST_MODEL,
      ...fastRequestOptions(),
      input: [
        { role: "system", content: TEXT_TUTOR_INSTRUCTIONS },
        {
          role: "user",
          content: [
            subject ? `과목: ${subject}` : null,
            `문제: ${question}`,
            `학생 답: ${myAnswer || "(무응답)"}`,
            `정답: ${correctAnswer}`,
            learningStatus === "correct_review"
              ? "문제 상태: 맞았지만 복습. 학생이 틀렸다고 단정하지 말고, 맞힌 풀이를 점검하며 핵심 개념과 다시 확인할 지점을 설명해."
              : "문제 상태: 틀린 문제. 학생 답과 정답의 차이를 근거로 오답 원인을 분석해.",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      text: {
        ...(usesFastGpt5 ? { verbosity: "low" as const } : {}),
        format: {
          type: "json_schema",
          name: "mistake_analysis",
          strict: true,
          schema: TEXT_ANALYSIS_SCHEMA,
        },
      },
      stream: true,
    }, { signal: runtime.signal });

    const streamed = await collectStream(stream, runtime);
    const parsed = JSON.parse(streamed.outputText || "{}");
    return {
      analysis: parsed.analysis ?? "",
      mistakeType: parsed.mistake_type ?? "",
      tags: parsed.tags ?? [],
      succeeded: true,
      usage: streamed.usage,
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
  recognizedQuestionHint,
  recognizedLatex,
  learningStatus,
  studentSolutionBase64,
  studentSolutionMimeType,
  studentSolutionFilename,
  runtime = {},
}: {
  fileBase64: string;
  mimeType: string;
  filename: string;
  subject: string;
  myAnswerHint: string;
  correctAnswerHint: string;
  recognizedQuestionHint?: string;
  recognizedLatex?: string;
  learningStatus: "incorrect" | "correct_review";
  studentSolutionBase64?: string;
  studentSolutionMimeType?: string;
  studentSolutionFilename?: string;
  runtime?: AnalysisRuntimeOptions;
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
           detail: OPENAI_IMAGE_DETAIL,
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
             detail: OPENAI_IMAGE_DETAIL,
          }
      : null;

  const hintLines = [
    recognizedQuestionHint
      ? `사용자가 손글씨 인식 결과를 확인하거나 수정한 문제 전문: ${recognizedQuestionHint}. 이 텍스트를 문제의 기준으로 사용하고 원본 필기 이미지와 대조해 기호와 수식을 확인해 주세요.`
      : null,
    recognizedLatex
      ? `손글씨에서 인식하고 사용자가 확인한 수식 LaTeX: ${recognizedLatex}. 문제 전문과 원본 이미지가 충돌하면 사용자가 확인한 내용을 우선하세요.`
      : null,
    subject ? `과목: ${subject}` : null,
    "첨부된 이미지 또는 PDF를 원본으로 보고 문제를 정확히 판독한 뒤, 문제를 독립적으로 처음부터 풀어줘.",
    "인쇄된 문제 조건과 학생 필기·채점 표시를 분리하고, recognized_conditions에서 모든 수치와 단위를 먼저 점검해줘.",
    learningStatus === "correct_review"
      ? "문제 상태는 '맞았지만 복습'이야. 학생이 틀렸다고 표현하지 말고, 정답에 도달한 과정을 점검하면서 핵심 개념과 다시 확인할 지점을 정리해줘."
      : "문제 상태는 '틀린 문제'야. 학생 답과 정답의 차이를 근거로 실제 오답 원인을 분석해줘.",
    studentSolutionContent
      ? "두 번째 첨부 파일은 학생의 실제 풀이야. 표시된 계산과 문장을 근거로 실제 오류 지점을 찾고, solution_steps에는 학생 풀이와 별개로 완전한 정답 풀이를 작성해줘."
      : "학생 풀이 파일은 없어. confusion_points에는 이 문제에서 자주 생기는 예상 혼동 지점을 작성해줘.",
    myAnswerHint ? `학생이 직접 알려준 자신의 답: ${myAnswerHint}` : null,
    correctAnswerHint ? `학생이 직접 알려준 정답: ${correctAnswerHint}. 독립 풀이와 일치하는지 확인하고, 불일치하면 독립 계산 결과를 사용하면서 차이를 분석에 밝혀줘.` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const stream = await getOpenAI().responses.create({
    model: GPT_FILE_MODEL,
    ...reasoningRequestOptions(),
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
      ...(usesFileGpt5 ? { verbosity: OPENAI_FILE_VERBOSITY } : {}),
      format: {
        type: "json_schema",
        name: "mistake_analysis_from_file",
        strict: true,
        schema: FILE_ANALYSIS_SCHEMA,
      },
    },
    stream: true,
  }, { signal: runtime.signal });

  const streamed = await collectStream(stream, runtime);
  const parsed = JSON.parse(streamed.outputText || "{}");
  const details = parsed.details ?? {};
  const verifiedDetails = verifyAndCorrectMathDetails({
    title: details.title ?? "",
    subject: details.subject ?? "",
    gradeLevel: details.grade_level ?? "",
    curriculum: details.curriculum ?? "",
    difficulty: details.difficulty ?? "",
    questionType: details.question_type ?? "",
    coreConcepts: details.core_concepts ?? [],
    recognizedConditions: details.recognized_conditions ?? [],
    learningElements: (details.learning_elements ?? []).map(
      (element: { concept?: string; explanation?: string; learning_stage?: string }) => ({
        concept: element.concept ?? "",
        explanation: element.explanation ?? "",
        learningStage: element.learning_stage ?? "",
      }),
    ),
    gradeRationale: details.grade_rationale ?? "",
    difficultyRationale: details.difficulty_rationale ?? "",
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
  });
  const region = details.problem_region;
  const problemRegion = region && [region.x, region.y, region.width, region.height].every(Number.isFinite)
    ? {
        x: Number(region.x),
        y: Number(region.y),
        width: Number(region.width),
        height: Number(region.height),
        confidence: region.confidence === "high" || region.confidence === "medium"
          ? region.confidence
          : "low" as const,
      }
    : undefined;
  const correctedAnswer = applyMathVerificationCorrections(
    parsed.correct_answer ?? "",
    verifiedDetails.mathVerification,
  );
  return {
    question: parsed.question ?? "",
    myAnswer: parsed.student_answer ?? "",
    correctAnswer: correctedAnswer,
    analysis: parsed.analysis ?? "",
    mistakeType: parsed.mistake_type ?? "",
    tags: parsed.tags ?? [],
    details: { ...verifiedDetails, problemRegion },
    succeeded: true,
    usage: streamed.usage,
  };
}

export async function recognizeHandwritingImage({
  imageBase64,
  mimeType,
  signal,
}: {
  imageBase64: string;
  mimeType: string;
  signal?: AbortSignal;
}): Promise<HandwritingRecognitionResult> {
  try {
    const response = await getOpenAI().responses.create({
      model: GPT_FAST_MODEL,
      ...fastRequestOptions(),
      input: [
        {
          role: "system",
          content: [
            "너는 한국어 손글씨 문제 인식기다.",
            "풀이하거나 정답을 만들지 말고, 이미지에 작성된 문제만 정확히 옮긴다.",
            "지수, 분수, 근호, 괄호, 부호, 소수점, 단위와 보기 번호를 보존한다.",
            "수학식은 recognized_text에는 사람이 읽기 쉬운 일반 표기로, latex에는 LaTeX로 정규화한다.",
            "불확실한 문자는 임의로 확정하지 말고 warnings에 적는다.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: "이 손글씨 문제를 판독해 주세요." },
            {
              type: "input_image",
              image_url: `data:${mimeType};base64,${imageBase64}`,
              detail: OPENAI_IMAGE_DETAIL,
            },
          ],
        },
      ],
      text: {
        ...(usesFastGpt5 ? { verbosity: "low" as const } : {}),
        format: {
          type: "json_schema",
          name: "handwriting_recognition",
          strict: true,
          schema: HANDWRITING_RECOGNITION_SCHEMA,
        },
      },
    }, { signal });
    const parsed = JSON.parse(response.output_text || "{}");
    return {
      recognizedText: String(parsed.recognized_text ?? ""),
      latex: String(parsed.latex ?? ""),
      confidence: parsed.confidence === "low" || parsed.confidence === "medium" ? parsed.confidence : "high",
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
      succeeded: true,
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      },
    };
  } catch (error) {
    console.error("recognizeHandwritingImage failed:", error);
    return {
      recognizedText: "",
      latex: "",
      confidence: "low",
      warnings: [],
      succeeded: false,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}
