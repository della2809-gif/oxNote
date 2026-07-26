"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { nextBoxLevel, nextReviewDate, isMastered } from "@/lib/spaced-repetition";

async function analyzeMistake(question: string, myAnswer: string, correctAnswer: string, subject: string) {
  try {
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
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    return {
      analysis: parsed.analysis ?? "",
      mistakeType: parsed.mistake_type ?? "",
      tags: (parsed.tags ?? []) as string[],
    };
  } catch {
    return { analysis: "", mistakeType: "", tags: [] as string[] };
  }
}

export async function createNote(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const question = String(formData.get("question") ?? "").trim();
  const myAnswer = String(formData.get("myAnswer") ?? "").trim();
  const correctAnswer = String(formData.get("correctAnswer") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();
  const subjectId = String(formData.get("subjectId") ?? "") || null;

  if (!question || !correctAnswer) {
    redirect("/notes/new?error=" + encodeURIComponent("문제와 정답은 필수입니다."));
  }

  let subjectName = "";
  if (subjectId) {
    const { data: subject } = await supabase
      .from("subjects")
      .select("name")
      .eq("id", subjectId)
      .single();
    subjectName = subject?.name ?? "";
  }

  const { analysis, mistakeType, tags } = await analyzeMistake(
    question,
    myAnswer,
    correctAnswer,
    subjectName,
  );

  const { data, error } = await supabase
    .from("notes")
    .insert({
      user_id: user.id,
      subject_id: subjectId,
      source: source || null,
      question,
      my_answer: myAnswer || null,
      correct_answer: correctAnswer,
      ai_analysis: analysis,
      mistake_type: mistakeType,
      tags,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect("/notes/new?error=" + encodeURIComponent(error?.message ?? "저장에 실패했습니다."));
  }

  revalidatePath("/notes");
  revalidatePath("/dashboard");
  redirect(`/notes/${data.id}`);
}

export async function deleteNote(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("notes").delete().eq("id", id);
  revalidatePath("/notes");
  revalidatePath("/dashboard");
  redirect("/notes");
}

export async function submitReview(formData: FormData) {
  const id = String(formData.get("id"));
  const result = String(formData.get("result")) as "correct" | "incorrect";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: note } = await supabase
    .from("notes")
    .select("box_level")
    .eq("id", id)
    .single();

  if (note) {
    const boxLevel = nextBoxLevel(note.box_level, result === "correct");
    await supabase
      .from("notes")
      .update({
        box_level: boxLevel,
        next_review_at: nextReviewDate(boxLevel).toISOString(),
        mastered: isMastered(boxLevel),
      })
      .eq("id", id);

    await supabase.from("review_logs").insert({ note_id: id, user_id: user.id, result });
  }

  revalidatePath("/review");
  revalidatePath("/dashboard");
  revalidatePath(`/notes/${id}`);
}
