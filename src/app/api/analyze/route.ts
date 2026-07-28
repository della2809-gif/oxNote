import { NextResponse } from "next/server";
import { analyzeFromText } from "@/lib/analyze";
import { finalizeAiUsage, reserveAiUsage, usageErrorMessage } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { question, myAnswer, correctAnswer, subject } = await request.json();

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

  const reservation = await reserveAiUsage(user.id, "text_analysis");
  if (!reservation.allowed) {
    return NextResponse.json(
      { error: usageErrorMessage(reservation.reason), reason: reservation.reason },
      { status: reservation.reason === "rate_limited" ? 429 : 402 },
    );
  }

  const result = await analyzeFromText({
    question,
    myAnswer: myAnswer ?? "",
    correctAnswer,
    subject: subject ?? "",
  });
  await finalizeAiUsage({
    userId: user.id,
    requestKey: reservation.requestKey,
    succeeded: result.succeeded,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    failureReason: result.succeeded ? undefined : "OpenAI text analysis failed",
  });

  if (!result.succeeded) {
    return NextResponse.json({ error: "AI analysis failed" }, { status: 502 });
  }

  return NextResponse.json({
    analysis: result.analysis,
    mistakeType: result.mistakeType,
    tags: result.tags,
  });
}
