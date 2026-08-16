import { after } from "next/server";
import { NextResponse } from "next/server";
import { analysisCacheKey, readAnalysisCache, writeAnalysisCache, type PracticeProblemCache } from "@/lib/ai-analysis-cache";
import { finalizeAiUsage, reserveAiUsage, usageErrorMessage } from "@/lib/billing";
import { getOpenAI, GPT_FAST_MODEL } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";

const PRACTICE_SCHEMA = {
  type: "object",
  properties: {
    question: { type: "string", description: "원문과 수치·소재는 다르지만 같은 핵심 개념과 비슷한 난이도의 완결된 새 문제" },
    hint: { type: "string", description: "정답을 직접 말하지 않는 한 문장 힌트" },
    answer: { type: "string", description: "최종 정답" },
    solution: { type: "string", description: "학생이 검산할 수 있는 간결하고 완전한 풀이" },
  },
  required: ["question", "hint", "answer", "solution"],
  additionalProperties: false,
} as const;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { data: note } = await supabase
    .from("notes")
    .select("id, question, correct_answer, ai_details")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!note) return NextResponse.json({ error: "오답노트를 찾을 수 없습니다." }, { status: 404 });

  const details = note.ai_details && typeof note.ai_details === "object" && !Array.isArray(note.ai_details)
    ? note.ai_details as Record<string, unknown>
    : {};
  const cacheKey = analysisCacheKey([
    "similar_problem_v1",
    user.id,
    id,
    note.question,
    note.correct_answer,
    JSON.stringify(details.coreConcepts ?? []),
  ]);
  const cached = await readAnalysisCache<PracticeProblemCache>(supabase, user.id, cacheKey);
  if (cached) return NextResponse.json({ practice: cached, cacheHit: true });

  const requestId = request.headers.get("x-request-id")?.slice(0, 120) || crypto.randomUUID();
  const reservation = await reserveAiUsage(user.id, "text_analysis", supabase, requestId);
  if (!reservation.allowed) {
    return NextResponse.json({ error: usageErrorMessage(reservation.reason) }, { status: reservation.reason === "rate_limited" ? 429 : 402 });
  }

  try {
    const response = await getOpenAI().responses.create({
      model: GPT_FAST_MODEL,
      input: [
        {
          role: "system",
          content: "너는 Xonote 복습 문제 출제자다. 원문을 복사하지 말고 같은 핵심 개념과 비슷한 난이도의 새 문제를 만든다. 숫자·인물·상황을 바꾸되 풀이 가능성과 정답을 독립 검산한다. 외부 그림이나 표가 없어도 풀 수 있는 자기완결형 문제만 출제한다. 수식은 \\( ... \\) 또는 \\[ ... \\] LaTeX로 한 번만 표현한다.",
        },
        {
          role: "user",
          content: `원래 문제:\n${note.question}\n\n원래 정답:\n${note.correct_answer}\n\n핵심 개념:\n${JSON.stringify(details.coreConcepts ?? [])}\n난이도: ${String(details.difficulty ?? "원문과 유사")}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "similar_practice_problem",
          strict: true,
          schema: PRACTICE_SCHEMA,
        },
      },
    }, { signal: request.signal });
    const practice = JSON.parse(response.output_text || "{}") as PracticeProblemCache;
    if (!practice.question || !practice.answer || !practice.solution) throw new Error("Incomplete practice problem");

    after(() => Promise.all([
      writeAnalysisCache(supabase, { userId: user.id, cacheKey, kind: "text_analysis", model: GPT_FAST_MODEL, result: practice }),
      finalizeAiUsage({
        userId: user.id,
        requestKey: reservation.requestKey,
        succeeded: true,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        existingClient: supabase,
      }),
    ]));
    return NextResponse.json({ practice, cacheHit: false });
  } catch (error) {
    console.error("Similar problem generation failed:", error);
    after(() => finalizeAiUsage({
      userId: user.id,
      requestKey: reservation.requestKey,
      succeeded: false,
      failureReason: "Similar problem generation failed",
      existingClient: supabase,
    }));
    return NextResponse.json({ error: "비슷한 문제를 만들지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }
}
