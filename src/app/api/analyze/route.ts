import { NextResponse } from "next/server";
import { after } from "next/server";
import { analyzeFromText } from "@/lib/analyze";
import { analysisCacheKey, readAnalysisCache, writeAnalysisCache } from "@/lib/ai-analysis-cache";
import { createAiPerformanceTracker } from "@/lib/ai-performance";
import { finalizeAiUsage, reserveAiUsage, usageErrorMessage } from "@/lib/billing";
import { GPT_FAST_MODEL } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id")?.slice(0, 120) || crypto.randomUUID();
  const perf = createAiPerformanceTracker(requestId, { flow: "text_analysis_api" });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  perf.mark("auth", { authenticated: Boolean(user) });
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { question, myAnswer, correctAnswer, subject } = await request.json();
  perf.mark("request_parse");

  if (
    typeof question !== "string" ||
    typeof correctAnswer !== "string" ||
    !question.trim() ||
    !correctAnswer.trim()
  ) {
    return NextResponse.json({ error: "question and correctAnswer are required" }, { status: 400 });
  }
  if (question.length > 12_000 || correctAnswer.length > 5_000 || String(myAnswer ?? "").length > 5_000) {
    return NextResponse.json({ error: "input is too long" }, { status: 413 });
  }

  const cacheKey = analysisCacheKey([
    "text_analysis",
    user.id,
    String(subject ?? ""),
    question,
    String(myAnswer ?? ""),
    correctAnswer,
  ]);
  const cacheStartedAt = performance.now();
  const cached = await readAnalysisCache<Awaited<ReturnType<typeof analyzeFromText>>>(
    supabase,
    user.id,
    cacheKey,
  );
  perf.measure("cache_lookup", cacheStartedAt, { cacheHit: Boolean(cached) });

  const reservation = cached
    ? null
    : await reserveAiUsage(user.id, "text_analysis", supabase, requestId);
  perf.mark("usage_reservation", { skipped: Boolean(cached) });
  if (reservation && !reservation.allowed) {
    return NextResponse.json(
      { error: usageErrorMessage(reservation.reason), reason: reservation.reason },
      { status: reservation.reason === "rate_limited" ? 429 : 402 },
    );
  }

  const openAiStartedAt = performance.now();
  const result = cached ?? await analyzeFromText({
    question,
    myAnswer: myAnswer ?? "",
    correctAnswer,
    subject: subject ?? "",
    runtime: {
      signal: request.signal,
      onFirstToken: () => perf.measure("openai_first_token", openAiStartedAt),
    },
  });
  if (!cached) {
    perf.measure("openai_complete", openAiStartedAt, {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });
    after(() => writeAnalysisCache(supabase, {
      userId: user.id,
      cacheKey,
      kind: "text_analysis",
      model: GPT_FAST_MODEL,
      result,
    }));
  }
  if (reservation) {
    after(() => finalizeAiUsage({
      userId: user.id,
      requestKey: reservation.requestKey,
      succeeded: result.succeeded,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      failureReason: result.succeeded ? undefined : "OpenAI text analysis failed",
      existingClient: supabase,
    }));
  }

  if (!result.succeeded) {
    return NextResponse.json({ error: "AI analysis failed" }, { status: 502 });
  }

  const summary = perf.finish({ cacheHit: Boolean(cached) });
  return NextResponse.json({
    analysis: result.analysis,
    mistakeType: result.mistakeType,
    tags: result.tags,
    requestId,
    cacheHit: Boolean(cached),
  }, {
    headers: {
      "Server-Timing": `total;dur=${summary.totalMs.toFixed(1)}`,
      "X-Request-Id": requestId,
    },
  });
}
