import { NextResponse } from "next/server";
import { analyzeFromText } from "@/lib/analyze";
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

  const { analysis, mistakeType, tags } = await analyzeFromText({
    question,
    myAnswer: myAnswer ?? "",
    correctAnswer,
    subject: subject ?? "",
  });

  return NextResponse.json({ analysis, mistakeType, tags });
}
