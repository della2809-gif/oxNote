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
const MAX_MISTAKE_REASON_LENGTH = 2_000;
const SUBJECT_COLORS = [
  "#6366f1",
  "#ec4899",
  "#22c55e",
  "#f59e0b",
  "#06b6d4",
  "#a855f7",
  "#ef4444",
];

async function lookupSubjectName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  subjectId: string | null,
): Promise<string> {
  if (!subjectId) return "";
  const { data } = await supabase.from("subjects").select("name").eq("id", subjectId).single();
  return data?.name ?? "";
}

function normalizeAiSubject(rawSubject: string) {
  const normalized = rawSubject.trim().replace(/\s+/g, " ").slice(0, 40);
  const commonSubjects = [
    "국어",
    "영어",
    "수학",
    "과학",
    "사회",
    "한국사",
    "물리",
    "화학",
    "생명과학",
    "지구과학",
  ];
  return commonSubjects.find((subject) => normalized.includes(subject)) ?? normalized;
}

function subjectColor(name: string) {
  const hash = Array.from(name).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return SUBJECT_COLORS[hash % SUBJECT_COLORS.length];
}

async function resolveSubjectId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  selectedSubjectId: string | null,
  aiSubject: string,
) {
  if (selectedSubjectId) return selectedSubjectId;

  const name = normalizeAiSubject(aiSubject);
  if (!name) return null;

  const { data: existing } = await supabase
    .from("subjects")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return String(existing.id);

  const { data: created } = await supabase
    .from("subjects")
    .insert({ user_id: userId, name, color: subjectColor(name) })
    .select("id")
    .maybeSingle();
  if (created?.id) return String(created.id);

  const { data: racedExisting } = await supabase
    .from("subjects")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  return racedExisting?.id ? String(racedExisting.id) : null;
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

  const selectedFile = formData.get("file");
  const cameraFile = formData.get("cameraFile");
  const solutionFile = formData.get("solutionFile");
  const source = String(formData.get("source") ?? "").trim();
  const subjectId = String(formData.get("subjectId") ?? "") || null;
  const myAnswerHint = String(formData.get("myAnswerHint") ?? "").trim();
  const correctAnswerHint = String(formData.get("correctAnswerHint") ?? "").trim();

  const file =
    selectedFile instanceof File && selectedFile.size > 0
      ? selectedFile
      : cameraFile instanceof File && cameraFile.size > 0
        ? cameraFile
        : null;

  if (!file) {
    redirect("/notes/new?error=" + encodeURIComponent("업로드할 사진 또는 PDF 파일을 선택해주세요."));
  }

  const uploadedFile = file;
  const uploadedSolution =
    solutionFile instanceof File && solutionFile.size > 0 ? solutionFile : null;

  if (!ACCEPTED_FILE_TYPES.includes(uploadedFile.type)) {
    redirect("/notes/new?error=" + encodeURIComponent("사진(JPG/PNG/WEBP) 또는 PDF 파일만 업로드할 수 있습니다."));
  }
  if (uploadedSolution && !ACCEPTED_FILE_TYPES.includes(uploadedSolution.type)) {
    redirect(
      "/notes/new?error=" +
        encodeURIComponent("학생 풀이도 사진(JPG/PNG/WEBP) 또는 PDF 파일만 올릴 수 있습니다."),
    );
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
  if (uploadedSolution && uploadedSolution.size > planFileLimit) {
    const limitMb = Math.floor(planFileLimit / 1024 / 1024);
    redirect(
      "/notes/new?error=" +
        encodeURIComponent(`학생 풀이 파일은 ${limitMb}MB 이하로 올려주세요.`),
    );
  }
  const monthlyUploadedBytes = await getMonthlyUploadedBytes(user.id);
  const requestedUploadBytes = uploadedFile.size + (uploadedSolution?.size ?? 0);
  if (monthlyUploadedBytes + requestedUploadBytes > entitlements.monthlyStorageBytes) {
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
  const solutionArrayBuffer = uploadedSolution
    ? await uploadedSolution.arrayBuffer()
    : null;

  let analyzed;
  try {
    analyzed = await analyzeFromFile({
      fileBase64,
      mimeType: uploadedFile.type,
      filename: uploadedFile.name,
      subject: subjectName,
      myAnswerHint,
      correctAnswerHint,
      studentSolutionBase64: solutionArrayBuffer
        ? Buffer.from(solutionArrayBuffer).toString("base64")
        : undefined,
      studentSolutionMimeType: uploadedSolution?.type,
      studentSolutionFilename: uploadedSolution?.name,
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

  const resolvedSubjectId = await resolveSubjectId(
    supabase,
    user.id,
    subjectId,
    analyzed.details.subject,
  );

  const safeFilename = uploadedFile.name
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._가-힣-]/g, "_")
    .slice(-120);
  const storagePath = `${user.id}/${crypto.randomUUID()}-${safeFilename || "problem-file"}`;
  const { error: uploadError } = await supabase.storage
    .from("note-files")
    .upload(storagePath, arrayBuffer, { contentType: uploadedFile.type });

  let studentSolutionPath: string | null = null;
  let studentSolutionUploadError = false;
  if (uploadedSolution && solutionArrayBuffer) {
    const safeSolutionFilename = uploadedSolution.name
      .normalize("NFKC")
      .replace(/[^a-zA-Z0-9._가-힣-]/g, "_")
      .slice(-120);
    studentSolutionPath =
      `${user.id}/${crypto.randomUUID()}-${safeSolutionFilename || "student-solution"}`;
    const { error: solutionUploadError } = await supabase.storage
      .from("note-files")
      .upload(studentSolutionPath, solutionArrayBuffer, {
        contentType: uploadedSolution.type,
      });
    studentSolutionUploadError = Boolean(solutionUploadError);
    if (solutionUploadError) studentSolutionPath = null;
  }

  const { data, error } = await supabase
    .from("notes")
    .insert({
      user_id: user.id,
      subject_id: resolvedSubjectId,
      source: source || null,
      question: analyzed.question,
      my_answer: (myAnswerHint || analyzed.myAnswer) || null,
      correct_answer: correctAnswerHint || analyzed.correctAnswer,
      ai_analysis: analyzed.analysis,
      ai_details: analyzed.details,
      mistake_type: analyzed.mistakeType,
      tags: analyzed.tags,
      source_file_url: uploadError ? null : storagePath,
      source_file_size_bytes: uploadError ? null : uploadedFile.size,
      student_solution_file_url: studentSolutionPath,
      student_solution_file_size_bytes:
        studentSolutionUploadError ? null : (uploadedSolution?.size ?? null),
    })
    .select("id")
    .single();

  if (error || !data) {
    const uploadedPaths = [
      uploadError ? null : storagePath,
      studentSolutionPath,
    ].filter((path): path is string => Boolean(path));
    if (uploadedPaths.length > 0) {
      await supabase.storage.from("note-files").remove(uploadedPaths);
    }
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
    .select("source_file_url, student_solution_file_url")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const filesToRemove = [
    note?.source_file_url,
    note?.student_solution_file_url,
  ].filter((path): path is string => Boolean(path));
  if (filesToRemove.length > 0) {
    await supabase.storage.from("note-files").remove(filesToRemove);
  }

  await supabase.from("notes").delete().eq("id", id);
  revalidatePath("/notes");
  revalidatePath("/dashboard");
  redirect("/notes");
}

export async function updateNoteMistakeReason(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const userMistakeReason = String(formData.get("userMistakeReason") ?? "").trim();

  if (!id || userMistakeReason.length > MAX_MISTAKE_REASON_LENGTH) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("notes")
    .update({ user_mistake_reason: userMistakeReason || null })
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath(`/notes/${id}`);
  revalidatePath("/notes");
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
