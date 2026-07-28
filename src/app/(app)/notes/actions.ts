"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { analyzeFromFile, analyzeFromText } from "@/lib/analyze";
import {
  finalizeAiUsage,
  getMonthlyUploadedBytes,
  getUserEntitlements,
  reserveAiUsage,
  usageErrorMessage,
} from "@/lib/billing";
import { nextBoxLevel, nextReviewDate, isMastered } from "@/lib/spaced-repetition";

const ACCEPTED_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const MAX_QUESTION_LENGTH = 12_000;
const MAX_ANSWER_LENGTH = 5_000;

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
  if (
    question.length > MAX_QUESTION_LENGTH ||
    myAnswer.length > MAX_ANSWER_LENGTH ||
    correctAnswer.length > MAX_ANSWER_LENGTH
  ) {
    redirect("/notes/new?error=" + encodeURIComponent("입력 내용이 너무 깁니다. 문제와 답을 나누어 등록해 주세요."));
  }

  const subjectName = await lookupSubjectName(supabase, subjectId);
  const reservation = await reserveAiUsage(user.id, "text_analysis");
  if (!reservation.allowed) {
    redirect("/notes/new?error=" + encodeURIComponent(usageErrorMessage(reservation.reason)));
  }

  const analyzed = await analyzeFromText({
    question,
    myAnswer,
    correctAnswer,
    subject: subjectName,
  });

  await finalizeAiUsage({
    userId: user.id,
    requestKey: reservation.requestKey,
    succeeded: analyzed.succeeded,
    inputTokens: analyzed.usage.inputTokens,
    outputTokens: analyzed.usage.outputTokens,
    failureReason: analyzed.succeeded ? undefined : "OpenAI text analysis failed",
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
      ai_analysis: analyzed.analysis,
      mistake_type: analyzed.mistakeType,
      tags: analyzed.tags,
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
  const entitlements = await getUserEntitlements(user.id);
  const planFileLimit = Math.min(entitlements.maxFileBytes, MAX_FILE_SIZE_BYTES);
  if (uploadedFile.size > planFileLimit) {
    const limitMb = Math.floor(planFileLimit / 1024 / 1024);
    redirect(
      "/notes/new?error=" +
        encodeURIComponent(`${entitlements.planName} 플랜은 파일당 최대 ${limitMb}MB까지 업로드할 수 있습니다.`),
    );
  }
  const monthlyUploadedBytes = await getMonthlyUploadedBytes(user.id);
  if (monthlyUploadedBytes + uploadedFile.size > entitlements.monthlyStorageBytes) {
    redirect(
      "/notes/new?error=" +
        encodeURIComponent(
          `${entitlements.planName} 플랜의 이번 달 파일 업로드 한도를 초과합니다. 요금제 페이지를 확인해 주세요.`,
        ),
    );
  }

  const subjectName = await lookupSubjectName(supabase, subjectId);
  const reservation = await reserveAiUsage(user.id, "file_analysis");
  if (!reservation.allowed) {
    redirect("/notes/new?error=" + encodeURIComponent(usageErrorMessage(reservation.reason)));
  }
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
    await finalizeAiUsage({
      userId: user.id,
      requestKey: reservation.requestKey,
      succeeded: false,
      failureReason: "OpenAI file analysis failed",
    });
    redirect("/notes/new?error=" + encodeURIComponent("파일 분석에 실패했습니다. 다시 시도해주세요."));
  }

  await finalizeAiUsage({
    userId: user.id,
    requestKey: reservation.requestKey,
    succeeded: analyzed.succeeded,
    inputTokens: analyzed.usage.inputTokens,
    outputTokens: analyzed.usage.outputTokens,
  });

  if (!analyzed.question || !analyzed.correctAnswer) {
    redirect("/notes/new?error=" + encodeURIComponent("파일에서 문제와 정답을 읽어내지 못했습니다. 직접 입력을 이용해주세요."));
  }

  const safeFilename = uploadedFile.name
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._가-힣-]/g, "_")
    .slice(-120);
  const storagePath = `${user.id}/${crypto.randomUUID()}-${safeFilename || "problem-file"}`;
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
      source_file_size_bytes: uploadError ? null : uploadedFile.size,
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: note } = await supabase
    .from("notes")
    .select("source_file_url")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (note?.source_file_url) {
    await supabase.storage.from("note-files").remove([note.source_file_url]);
  }

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
