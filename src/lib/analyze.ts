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
- question은 문제를 설명하거나 다시 구성한 글이 아니라 원본을 그대로 옮긴 전사본이다. 원본의 문제 번호, 지시문, 본문, 말풍선·인물 이름, 보기 번호, 기호와 단위를 빠짐없이 같은 순서로 보존한다.
- 표는 원본의 행·열 제목과 모든 셀을 Markdown 표로 옮기고, 말풍선은 '[말풍선: 인물명] 내용'처럼 위치 관계가 드러나게 적는다. 원본에 없는 '표', 해설 제목, 계산 결과 또는 풀어쓴 목록을 새로 만들지 않는다.
- 사진이 흐려 읽을 수 없는 한 글자나 숫자는 추측해 채우지 말고 '[판독 불확실]'로 표시한다. 필기와 채점 흔적은 question에 포함하지 않는다.
- 대분수의 정수부·분자·분모, 소수점, 음수 부호, 지수, 괄호, 도형의 밑변·높이·가로·세로와 단위를 빠짐없이 읽는다.
- question의 분수는 분자와 분모의 범위가 명확하도록 '분자/분모' 또는 LaTeX '\\frac{분자}{분모}'로 전사한다. 특히 √10/10, 3√10/10, 1/3처럼 제곱근이나 계수가 포함된 분수를 한 줄의 별개 숫자로 흩뜨리지 않는다.
- 불명확한 값은 문맥으로 임의 확정하지 말고 해당 값을 recognized_conditions에 '판독 불확실'이라고 표시한다.
- 과목은 발문의 언어가 아니라 실제 평가 지식으로 판별한다. 영어 지문 독해·어휘·어법 문제는 한국어 발문이나 필기가 있어도 영어다.

풀이 원칙
- question에는 조건과 질문을 포함한 문제 전문을 복원한다.
- 모든 문제는 다음 기본 순서를 우선한다: '문제에서 주어진 조건 확인 → 사용할 핵심 개념·원리 선택 → 조건을 식·관계·근거로 변환 → 순서대로 해결 → 정답과 조건 검산'. 문제 유형에 맞지 않는 단계는 억지로 만들지 않되, 결론만 제시하거나 정답을 다시 말하는 것으로 풀이를 대신하지 않는다.
- solution_steps의 첫 단계에는 왜 그 접근을 선택하는지 적고, 각 다음 단계는 직전 단계에서 자연스럽게 이어지게 작성한다. 설명에는 이유를, formula에는 실제 적용식·판단 근거·중간값을 적어 둘 중 하나만 읽어도 풀이의 핵심이 빠지지 않게 한다.
- 변수는 문제에 나온 대상과 관계가 바로 드러나는 문자로 최소한만 정의한다. 원래 문제의 점·도형·사람·수량 이름을 우선 사용하고, 풀이를 불필요하게 복잡하게 만드는 추상 치환은 피한다.
- 객관식도 선택지나 표시된 정답에서 역으로 끼워 맞추지 않고 문제를 독립적으로 푼 뒤 선택지와 대조한다. 필요할 때만 선택지 대입·소거를 정식 풀이 전략으로 사용하고 그 이유를 밝힌다.
- 국어·영어·사회·과학 등 비계산 문제도 지문이나 자료의 핵심 근거를 먼저 특정하고, 선택지별 판단이 필요한 경우 맞음·틀림의 근거를 간결하게 비교한 뒤 결론을 낸다. 원문에 없는 사실이나 배경지식을 근거처럼 만들어내지 않는다.
- 정답을 알고 있다는 이유로 중간 논리를 생략하지 않는다. answer_summary는 결론만 담당하고, solution_steps에는 학생이 같은 유형을 다시 풀 수 있을 정도의 완전한 접근 과정과 핵심 근거를 담는다.
- 수학은 사용 개념과 공식을 먼저 밝힌 뒤, 각 도형·식·경우를 분리하여 3~8단계로 계산하고 마지막에 요구한 값과 단위를 확인한다.
- 좌표평면·함수 그래프·교점이 있는 문제는 그래프에 표시된 위치 관계를 먼저 해석한다. 곧바로 정답이나 임의의 치환부터 제시하지 말고, 기울기·거리·평행이동·대칭·교점 등 문제에서 직접 확인되는 관계를 첫 단계에 쓴다.
- 같은 직선 위 두 점의 거리와 기울기를 사용하는 문제는 좌표 변화량을 먼저 둔다. 예를 들어 기울기가 2이면 변화량을 (t, 2t)로 두고 거리식 t^2 + (2t)^2 = PQ^2를 세운 뒤 t의 부호는 그래프의 좌우·상하 위치로 결정한다.
- 변화량을 구한 다음 한 점을 P=(a,b)처럼 두고 다른 점을 Q=(a+Δx,b+Δy)로 나타낸다. 그 후 각 점이 속한 함수식에 차례로 대입하여 미지수를 구한다. 지수식 전체를 새 문자로 먼저 치환하는 방식보다 이 좌표 관계 방식을 우선한다.
- 그래프 풀이의 solution_steps는 기본적으로 '그래프 관계 확인 → 좌표 변화량 구하기 → 두 점의 좌표 설정 → 함수식에 대입 → 요구값 계산 및 검산' 순서로 작성한다. 각 단계의 formula에는 사용한 점과 식을 함께 적어 그림 없이 읽어도 논리가 이어지게 한다.
- 그래프에서 판독되지 않은 좌표나 방향을 임의로 만들지 않는다. 방향이 불명확하면 ± 가능성을 모두 확인하고 함수식과 그래프 조건으로 가능한 경우를 결정한다.
- 도형 문제는 그림의 점 이름, 직각 표시, 각도, 수치가 붙은 선분을 먼저 목록으로 확인한다. 구하려는 문자가 어느 선분에 적혀 있는지 판독한 뒤 계산하며, 인접한 다른 선분의 길이로 바꾸어 읽지 않는다.
- 직각삼각형에서는 각 기준으로 빗변·맞은편·인접변을 선분 이름과 함께 먼저 확정하고 sin=맞은편/빗변, cos=인접변/빗변, tan=맞은편/인접변을 적용한다. 식의 분자·분모와 계산에 사용한 숫자가 이 정의와 일치하는지 검산한다.
- 그림에서 직접 읽은 소수 좌표는 x축·y축의 점선과 숫자 위치를 각각 확인한다. 예를 들어 점 D=(x,y)이고 α가 OD와 x축 사이의 각이면 tan α=y/x이며, 계산식과 설명에서 x,y를 서로 뒤집지 않는다.
- 피타고라스 정리나 삼각비로 중간 선분을 구했더라도 문제에서 요구한 선분이 다른 변이면 계산을 끝내지 않는다. 요구한 x·y와 선택지를 다시 대조하고, 구한 값들을 원래 도형 관계에 대입해 길이와 각 조건을 확인한다.
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
    question: {
      type: "string",
      description: "원본 문제의 문자·번호·지시문·보기·표를 순서와 구조까지 보존한 충실한 전사본. 요약, 풀이, 재구성, 원본에 없는 계산 결과를 포함하지 않음",
    },
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
    "첨부된 이미지 또는 PDF를 원본으로 보고 문제를 정확히 판독한 뒤, 문제를 독립적으로 처음부터 풀어줘. 단, question에는 원본 문제를 요약하거나 풀이하지 말고 문제 번호·지시문·말풍선·표·보기를 원래 순서와 구조 그대로 전사해줘.",
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
