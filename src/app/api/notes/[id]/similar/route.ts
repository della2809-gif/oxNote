import { after } from "next/server";
import { NextResponse } from "next/server";
import { analysisCacheKey, readAnalysisCache, writeAnalysisCache, type PracticeProblemCache } from "@/lib/ai-analysis-cache";
import { finalizeAiUsage, reserveAiUsage, usageErrorMessage } from "@/lib/billing";
import { getOpenAI, GPT_REASONING_MODEL } from "@/lib/openai";
import { isMathClassification } from "@/lib/learning-action-policy";
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

const VERIFICATION_SCHEMA = {
  type: "object",
  properties: {
    valid: { type: "boolean" },
    concept_match: { type: "boolean" },
    difficulty_match: { type: "boolean" },
    self_contained: { type: "boolean" },
    unique_answer: { type: "boolean" },
    answer_consistent: { type: "boolean" },
    final_answer: { type: "string", description: "독립 계산으로 확인한 최종 정답" },
    final_solution: { type: "string", description: "독립 검산을 반영한 완전한 풀이" },
    issues: { type: "array", items: { type: "string" } },
  },
  required: ["valid", "concept_match", "difficulty_match", "self_contained", "unique_answer", "answer_consistent", "final_answer", "final_solution", "issues"],
  additionalProperties: false,
} as const;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { data: note } = await supabase
    .from("notes")
    .select("id, subject_id, question, correct_answer, ai_details")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!note) return NextResponse.json({ error: "오답노트를 찾을 수 없습니다." }, { status: 404 });

  const details = note.ai_details && typeof note.ai_details === "object" && !Array.isArray(note.ai_details)
    ? note.ai_details as Record<string, unknown>
    : {};
  const { data: subject } = note.subject_id
    ? await supabase.from("subjects").select("name").eq("id", note.subject_id).eq("user_id", user.id).maybeSingle()
    : { data: null };
  const isMath = isMathClassification([subject?.name, details.subject, details.curriculum]);
  if (!isMath) return NextResponse.json({ error: "비슷한 문제 만들기는 현재 수학 과목에서만 사용할 수 있습니다." }, { status: 400 });

  const body = await request.json().catch(() => ({})) as { variant?: unknown };
  const variant = Number.isInteger(Number(body.variant))
    ? Math.max(0, Math.min(20, Number(body.variant)))
    : 0;
  const cacheKey = analysisCacheKey([
    "similar_math_problem_v3_reasoning_verified",
    user.id,
    id,
    note.question,
    note.correct_answer,
    JSON.stringify(details.coreConcepts ?? []),
    String(variant),
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
      model: GPT_REASONING_MODEL,
      reasoning: { effort: "medium" },
      input: [
        {
          role: "system",
          content: "너는 Xonote 수학 복습 문제 출제자다. 원문을 복사하지 말고 같은 핵심 개념과 비슷한 난이도의 새 문제를 만든다. 숫자·조건·상황을 바꾸되 교육과정 범위와 풀이 단계 수를 유지한다. 외부 그림이나 표가 없어도 풀 수 있는 자기완결형 문제만 출제한다. 모든 조건을 사용해 답이 하나로 정해지도록 하고, 분모 0·정의역·단위·보기와 정답의 일관성을 직접 검산한다. 수식은 \\( ... \\) 또는 \\[ ... \\] LaTeX로 한 번만 표현한다.",
        },
        {
          role: "user",
          content: `변형 번호: ${variant}\n원래 문제:\n${note.question}\n\n원래 정답:\n${note.correct_answer}\n\n핵심 개념:\n${JSON.stringify(details.coreConcepts ?? [])}\n난이도: ${String(details.difficulty ?? "원문과 유사")}`,
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
    if (practice.question.replace(/\s+/g, "") === String(note.question).replace(/\s+/g, "")) {
      throw new Error("Generated problem duplicates source");
    }

    const verification = await getOpenAI().responses.create({
      model: GPT_REASONING_MODEL,
      reasoning: { effort: "medium" },
      input: [
        {
          role: "system",
          content: "너는 독립적인 수학 문제 검수자다. 출제 결과를 믿지 말고 문제를 처음부터 직접 풀어 검증한다. 핵심 개념 일치, 원문과 유사한 난이도, 조건 완결성, 유일한 정답, 제시 풀이와 정답의 일치를 각각 판정한다. 하나라도 실패하면 valid=false다. final_answer와 final_solution에는 네가 독립 계산한 결과만 쓴다.",
        },
        {
          role: "user",
          content: `원문 핵심 개념: ${JSON.stringify(details.coreConcepts ?? [])}\n원문 난이도: ${String(details.difficulty ?? "원문과 유사")}\n\n검수할 새 문제:\n${practice.question}\n\n제시 정답:\n${practice.answer}\n\n제시 풀이:\n${practice.solution}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "verified_math_practice_problem",
          strict: true,
          schema: VERIFICATION_SCHEMA,
        },
      },
    }, { signal: request.signal });
    const audit = JSON.parse(verification.output_text || "{}") as {
      valid?: boolean;
      concept_match?: boolean;
      difficulty_match?: boolean;
      self_contained?: boolean;
      unique_answer?: boolean;
      answer_consistent?: boolean;
      final_answer?: string;
      final_solution?: string;
      issues?: string[];
    };
    const passed = audit.valid && audit.concept_match && audit.difficulty_match && audit.self_contained && audit.unique_answer && audit.answer_consistent;
    if (!passed || !audit.final_answer || !audit.final_solution) {
      throw new Error(`Math verification failed: ${(audit.issues ?? []).join("; ")}`);
    }
    const verifiedPractice: PracticeProblemCache = {
      ...practice,
      answer: audit.final_answer,
      solution: audit.final_solution,
    };

    after(() => Promise.all([
      writeAnalysisCache(supabase, { userId: user.id, cacheKey, kind: "text_analysis", model: `${GPT_REASONING_MODEL}:generate+independent-audit`, result: verifiedPractice }),
      finalizeAiUsage({
        userId: user.id,
        requestKey: reservation.requestKey,
        succeeded: true,
        inputTokens: (response.usage?.input_tokens ?? 0) + (verification.usage?.input_tokens ?? 0),
        outputTokens: (response.usage?.output_tokens ?? 0) + (verification.usage?.output_tokens ?? 0),
        existingClient: supabase,
      }),
    ]));
    return NextResponse.json({ practice: verifiedPractice, cacheHit: false, verified: true });
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
