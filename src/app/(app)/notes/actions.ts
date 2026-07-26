"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { analyzeFromFile, analyzeFromText } from "@/lib/analyze";
import { nextBoxLevel, nextReviewDate, isMastered } from "@/lib/spaced-repetition";

const ACCEPTED_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

async function lookupSubjectName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  subjectId: string | null,
): Promise<string> {
  if (!subjectId) return "";
  const { data } = await supabase.from("subjects").select("name").eq("id", subjectId).single();
  return data?.name ?? "";
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

  const subjectName = await lookupSubjectName(supabase, subjectId);

  const { analysis, mistakeType, tags } = await analyzeFromText({
    question,
    myAnswer,
    correctAnswer,
    subject: subjectName,
  });

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

export async function createNoteFromFile(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const file = formData.get("file");
  const source = String(formData.get("source") ?? "").trim();
  const subjectId = String(formData.get("subjectId") ?? "") || null;
  const myAnswerHint = String(formData.get("myAnswerHint") ?? "").trim();
  const correctAnswerHint = String(formData.get("correctAnswerHint") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) {
    redirect("/notes/new?error=" + encodeURIComponent("업로드할 사진 또는 PDF 파일을 선택해주세요."));
  }

  const uploadedFile = file as File;

  if (!ACCEPTED_FILE_TYPES.includes(uploadedFile.type)) {
    redirect("/notes/new?error=" + encodeURIComponent("사진(JPG/PNG/WEBP) 또는 PDF 파일만 업로드할 수 있습니다."));
  }
  if (uploadedFile.size > MAX_FILE_SIZE_BYTES) {
    redirect("/notes/new?error=" + encodeURIComponent("파일 크기는 15MB 이하여야 합니다."));
  }

  const subjectName = await lookupSubjectName(supabase, subjectId);
  const arrayBuffer = await uploadedFile.arrayBuffer();
  const fileBase64 = Buffer.from(arrayBuffer).toString("base64");

  let analyzed;
  try {
    analyzed = await analyzeFromFile({
      fileBase64,
      mimeType: uploadedFile.type,
      filename: uploadedFile.name,
      subject: subjectName,
      myAnswerHint,
      correctAnswerHint,
    });
  } catch {
    redirect("/notes/new?error=" + encodeURIComponent("파일 분석에 실패했습니다. 다시 시도해주세요."));
  }

  if (!analyzed.question || !analyzed.correctAnswer) {
    redirect("/notes/new?error=" + encodeURIComponent("파일에서 문제와 정답을 읽어내지 못했습니다. 직접 입력을 이용해주세요."));
  }

  const storagePath = `${user.id}/${crypto.randomUUID()}-${uploadedFile.name}`;
  const { error: uploadError } = await supabase.storage
    .from("note-files")
    .upload(storagePath, arrayBuffer, { contentType: uploadedFile.type });

  const { data, error } = await supabase
    .from("notes")
    .insert({
      user_id: user.id,
      subject_id: subjectId,
      source: source || null,
      question: analyzed.question,
      my_answer: (myAnswerHint || analyzed.myAnswer) || null,
      correct_answer: correctAnswerHint || analyzed.correctAnswer,
      ai_analysis: analyzed.analysis,
      mistake_type: analyzed.mistakeType,
      tags: analyzed.tags,
      source_file_url: uploadError ? null : storagePath,
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
