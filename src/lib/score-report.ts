import "server-only";

import { getOpenAI, GPT_MODEL } from "./openai";

export type ExtractedScoreReport = {
  schoolLevel: "elementary" | "middle" | "high" | "university" | "adult";
  gradeLevel: string;
  subjectName: string;
  examType: string;
  examName: string;
  examDate: string;
  rawScore: number;
  maxScore: number;
  examAverageScore: number | null;
  percentileRank: number | null;
  rankPosition: number | null;
  examineeCount: number | null;
  questionCount: number | null;
  wrongAnswerCount: number | null;
};

const SCORE_REPORT_SCHEMA = {
  type: "object",
  properties: {
    school_level: {
      type: "string",
      enum: ["elementary", "middle", "high", "university", "adult"],
    },
    grade_level: { type: "string" },
    subject_name: { type: "string" },
    exam_type: { type: "string" },
    exam_name: { type: "string" },
    exam_date: { type: "string", description: "YYYY-MM-DD; 확인할 수 없으면 오늘 날짜" },
    raw_score: { type: "number" },
    max_score: { type: "number" },
    exam_average_score: { type: ["number", "null"] },
    percentile_rank: { type: ["number", "null"] },
    rank_position: { type: ["integer", "null"] },
    examinee_count: { type: ["integer", "null"] },
    question_count: { type: ["integer", "null"] },
    wrong_answer_count: { type: ["integer", "null"] },
  },
  required: [
    "school_level",
    "grade_level",
    "subject_name",
    "exam_type",
    "exam_name",
    "exam_date",
    "raw_score",
    "max_score",
    "exam_average_score",
    "percentile_rank",
    "rank_position",
    "examinee_count",
    "question_count",
    "wrong_answer_count",
  ],
  additionalProperties: false,
};

export async function extractScoreReport({
  fileBase64,
  mimeType,
  filename,
}: {
  fileBase64: string;
  mimeType: string;
  filename: string;
}): Promise<{ data: ExtractedScoreReport; inputTokens: number; outputTokens: number }> {
  const fileContent = mimeType === "application/pdf"
    ? {
        type: "input_file" as const,
        filename,
        file_data: `data:application/pdf;base64,${fileBase64}`,
      }
    : {
        type: "input_image" as const,
        image_url: `data:${mimeType};base64,${fileBase64}`,
        detail: "high" as const,
      };

  const response = await getOpenAI().responses.create({
    model: GPT_MODEL,
    input: [
      {
        role: "system",
        content:
          "한국 학교·학원·시험 성적표를 읽는 데이터 추출 도우미다. 보이는 값만 추출하고 " +
          "이름, 학교명, 학번 등 개인정보는 결과에 포함하지 않는다. 백분위는 높을수록 좋은 0~100 값으로 통일한다.",
      },
      {
        role: "user",
        content: [
          fileContent,
          {
            type: "input_text" as const,
            text: "성적표에서 시험, 과목, 점수, 평균, 석차, 문항 수와 오답 수를 추출해 주세요. 확인되지 않는 선택 값은 null로 두세요.",
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "score_report_extraction",
        strict: true,
        schema: SCORE_REPORT_SCHEMA,
      },
    },
  });

  const parsed = JSON.parse(response.output_text || "{}");
  return {
    data: {
      schoolLevel: parsed.school_level,
      gradeLevel: parsed.grade_level,
      subjectName: parsed.subject_name,
      examType: parsed.exam_type,
      examName: parsed.exam_name,
      examDate: parsed.exam_date,
      rawScore: Number(parsed.raw_score),
      maxScore: Number(parsed.max_score),
      examAverageScore: nullableNumber(parsed.exam_average_score),
      percentileRank: nullableNumber(parsed.percentile_rank),
      rankPosition: nullableNumber(parsed.rank_position),
      examineeCount: nullableNumber(parsed.examinee_count),
      questionCount: nullableNumber(parsed.question_count),
      wrongAnswerCount: nullableNumber(parsed.wrong_answer_count),
    },
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
}

function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
