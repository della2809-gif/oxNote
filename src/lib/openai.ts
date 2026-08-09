import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAI() {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  client = new OpenAI({ apiKey });
  return client;
}

// 모델은 역할별로 분리한다. 짧은 분류·요약은 지연시간이 짧은 모델을,
// 이미지 판독과 수학 풀이처럼 정확도가 중요한 작업은 추론 모델을 사용한다.
export const GPT_FAST_MODEL =
  process.env.OPENAI_FAST_MODEL || "gpt-5.6-luna";
export const GPT_REASONING_MODEL =
  process.env.OPENAI_REASONING_MODEL ||
  process.env.OPENAI_ANALYSIS_MODEL ||
  "gpt-5.6-sol";
export const GPT_FILE_MODEL =
  process.env.OPENAI_FILE_MODEL || "gpt-5.6-terra";

// 기존 import와 배포 환경변수의 호환성을 유지한다.
export const GPT_MODEL = GPT_FAST_MODEL;
export const GPT_ANALYSIS_MODEL = GPT_REASONING_MODEL;

export const AI_ANALYSIS_VERSION = process.env.OPENAI_ANALYSIS_VERSION || "2026-08-09-v1";
export const OPENAI_REASONING_EFFORT:
  | "none"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max" =
  process.env.OPENAI_REASONING_EFFORT === "none" ||
  process.env.OPENAI_REASONING_EFFORT === "low" ||
  process.env.OPENAI_REASONING_EFFORT === "medium" ||
  process.env.OPENAI_REASONING_EFFORT === "high" ||
  process.env.OPENAI_REASONING_EFFORT === "xhigh" ||
  process.env.OPENAI_REASONING_EFFORT === "max"
    ? process.env.OPENAI_REASONING_EFFORT
    : "high";

export const OPENAI_FILE_REASONING_EFFORT:
  | "none"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max" =
  process.env.OPENAI_FILE_REASONING_EFFORT === "none" ||
  process.env.OPENAI_FILE_REASONING_EFFORT === "low" ||
  process.env.OPENAI_FILE_REASONING_EFFORT === "medium" ||
  process.env.OPENAI_FILE_REASONING_EFFORT === "high" ||
  process.env.OPENAI_FILE_REASONING_EFFORT === "xhigh" ||
  process.env.OPENAI_FILE_REASONING_EFFORT === "max"
    ? process.env.OPENAI_FILE_REASONING_EFFORT
    : "low";

export const OPENAI_FILE_VERBOSITY: "low" | "medium" | "high" =
  process.env.OPENAI_FILE_VERBOSITY === "low" ||
  process.env.OPENAI_FILE_VERBOSITY === "high"
    ? process.env.OPENAI_FILE_VERBOSITY
    : "medium";

export const OPENAI_IMAGE_DETAIL: "low" | "high" | "original" =
  process.env.OPENAI_IMAGE_DETAIL === "low" ||
  process.env.OPENAI_IMAGE_DETAIL === "original"
    ? process.env.OPENAI_IMAGE_DETAIL
    : "high";
