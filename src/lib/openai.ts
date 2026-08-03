import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAI() {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  client = new OpenAI({ apiKey });
  return client;
}

export const GPT_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

// 문제 사진의 작은 수식과 복합 조건을 읽고 완전한 풀이를 만드는 작업은
// 일반 텍스트 분류보다 높은 추론 품질이 필요하다. 다른 AI 기능의 비용 설정은
// 그대로 유지하면서 오답 분석 모델만 별도로 조정할 수 있게 분리한다.
export const GPT_ANALYSIS_MODEL =
  process.env.OPENAI_ANALYSIS_MODEL || "gpt-5.6-sol";
