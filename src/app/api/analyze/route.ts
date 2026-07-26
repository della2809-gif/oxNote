import { NextResponse } from "next/server";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
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

  if (!question || !correctAnswer) {
    return NextResponse.json({ error: "question and correctAnswer are required" }, { status: 400 });
  }

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 800,
    system:
      "너는 학생의 시험 오답을 분석해주는 튜터야. 주어진 문제, 학생의 답, 정답을 보고 " +
      "왜 틀렸는지 원인을 분석하고, 다시 틀리지 않기 위한 학습 포인트를 알려줘. " +
      "반드시 아래 JSON 형식으로만 답해. 다른 텍스트는 절대 포함하지 마.\n" +
      '{"analysis": "왜 틀렸는지와 핵심 개념 설명 (한국어, 3~5문장)", ' +
      '"mistake_type": "오류 유형을 짧게 (예: 개념 이해 부족, 계산 실수, 문제 오독, 암기 부족 등)", ' +
      '"tags": ["관련", "핵심", "개념", "태그"]}',
    messages: [
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
  });

  const textBlock = message.content.find((block) => block.type === "text");
  const raw = textBlock?.type === "text" ? textBlock.text : "{}";

  let parsed: { analysis?: string; mistake_type?: string; tags?: string[] };
  try {
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  } catch {
    parsed = { analysis: raw, mistake_type: undefined, tags: [] };
  }

  return NextResponse.json({
    analysis: parsed.analysis ?? "",
    mistakeType: parsed.mistake_type ?? "",
    tags: parsed.tags ?? [],
  });
}
