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
import {
  initialReviewDate,
  reviewScheduleAfterResult,
} from "@/lib/spaced-repetition";

const ACCEPTED_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const MAX_QUESTION_LENGTH = 12_000;
const MAX_ANSWER_LENGTH = 5_000;
const MAX_SOURCE_LENGTH = 500;
const MAX_MISTAKE_REASON_LENGTH = 2_000;
const LEARNING_STATUSES = ["incorrect", "correct_review"] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BULK_NOTES = 100;

function selectedNoteIds(formData: FormData) {
  return Array.from(
    new Set(
      formData
        .getAll("ids")
        .map((value) => String(value))
        .filter((value) => UUID_PATTERN.test(value)),
    ),
  ).slice(0, MAX_BULK_NOTES);
}

function notesReturnTo(formData: FormData) {
  const value = String(formData.get("returnTo") ?? "");
  return value === "/notes" || value.startsWith("/notes?") ? value : "/notes";
}

function redirectNotesMessage(returnTo: string, type: "error" | "success", message: string): never {
  const url = new URL(returnTo, "https://xonote.local");
  url.searchParams.set(type, message);
  redirect(`${url.pathname}${url.search}`);
}

function readLearningStatus(formData: FormData) {
  const value = String(formData.get("learningStatus") ?? "");
  return LEARNING_STATUSES.includes(value as (typeof LEARNING_STATUSES)[number])
    ? (value as (typeof LEARNING_STATUSES)[number])
    : null;
}
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
  const learningStatus = readLearningStatus(formData);

  if (!question || !myAnswer || !correctAnswer || !learningStatus) {
    redirect("/notes/new?error=" + encodeURIComponent("문제 상태, 내가 선택한 답, 정답은 필수입니다."));
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
    learningStatus,
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
      tags: [
        ...analyzed.tags,
        learningStatus === "correct_review" ? "학습상태:맞았지만 복습" : "학습상태:틀린 문제",
      ],
      box_level: 1,
      next_review_at: initialReviewDate().toISOString(),
      mastered: false,
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
  const learningStatus = readLearningStatus(formData);

  if (!myAnswerHint || !correctAnswerHint || !learningStatus) {
    redirect(
      "/notes/new?error=" +
        encodeURIComponent("문제 상태, 내가 선택한 답, 정답을 모두 입력해 주세요."),
    );
  }

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
      learningStatus,
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
      tags: [
        ...analyzed.tags,
        learningStatus === "correct_review" ? "학습상태:맞았지만 복습" : "학습상태:틀린 문제",
      ],
      box_level: 1,
      next_review_at: initialReviewDate().toISOString(),
      mastered: false,
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

export async function moveSelectedNotes(formData: FormData) {
  const ids = selectedNoteIds(formData);
  const returnTo = notesReturnTo(formData);
  const targetSubjectValue = String(formData.get("targetSubjectId") ?? "");
  if (ids.length === 0) {
    redirectNotesMessage(returnTo, "error", "과목을 이동할 오답을 선택해 주세요.");
  }
  if (!targetSubjectValue) {
    redirectNotesMessage(returnTo, "error", "이동할 과목을 선택해 주세요.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let targetSubjectId: string | null = null;
  let targetSubjectName = "과목 없음";
  if (targetSubjectValue !== "__none__") {
    if (!UUID_PATTERN.test(targetSubjectValue)) {
      redirectNotesMessage(returnTo, "error", "올바른 과목을 선택해 주세요.");
    }
    const { data: subject } = await supabase
      .from("subjects")
      .select("id, name")
      .eq("id", targetSubjectValue)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!subject) {
      redirectNotesMessage(returnTo, "error", "이동할 과목을 확인할 수 없습니다.");
    }
    targetSubjectId = subject.id;
    targetSubjectName = subject.name;
  }

  const { data: ownedNotes, error: selectError } = await supabase
    .from("notes")
    .select("id")
    .eq("user_id", user.id)
    .in("id", ids);
  if (selectError || ownedNotes?.length !== ids.length) {
    redirectNotesMessage(returnTo, "error", "선택한 오답 중 이동할 수 없는 항목이 있습니다.");
  }

  const { data: movedNotes, error: updateError } = await supabase
    .from("notes")
    .update({ subject_id: targetSubjectId })
    .eq("user_id", user.id)
    .in("id", ids)
    .select("id");
  if (updateError || movedNotes?.length !== ids.length) {
    redirectNotesMessage(returnTo, "error", "선택한 오답의 과목을 이동하지 못했습니다.");
  }

  revalidatePath("/notes");
  revalidatePath("/review");
  revalidatePath("/dashboard");
  redirectNotesMessage(
    returnTo,
    "success",
    `${ids.length}개의 오답을 '${targetSubjectName}'으로 이동했습니다.`,
  );
}

export async function deleteSelectedNotes(formData: FormData) {
  const ids = selectedNoteIds(formData);
  const returnTo = notesReturnTo(formData);
  if (ids.length === 0) {
    redirectNotesMessage(returnTo, "error", "삭제할 오답을 선택해 주세요.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: notes, error: selectError } = await supabase
    .from("notes")
    .select("id, source_file_url, student_solution_file_url")
    .eq("user_id", user.id)
    .in("id", ids);
  if (selectError || notes?.length !== ids.length) {
    redirectNotesMessage(returnTo, "error", "선택한 오답 중 삭제할 수 없는 항목이 있습니다.");
  }

  const { data: deletedNotes, error: deleteError } = await supabase
    .from("notes")
    .delete()
    .eq("user_id", user.id)
    .in("id", ids)
    .select("id");
  if (deleteError || deletedNotes?.length !== ids.length) {
    redirectNotesMessage(returnTo, "error", "선택한 오답을 삭제하지 못했습니다.");
  }

  const filesToRemove = Array.from(
    new Set(
      (notes ?? [])
        .flatMap((note) => [note.source_file_url, note.student_solution_file_url])
        .filter((path): path is string => Boolean(path)),
    ),
  );
  if (filesToRemove.length > 0) {
    await supabase.storage.from("note-files").remove(filesToRemove);
  }

  revalidatePath("/notes");
  revalidatePath("/review");
  revalidatePath("/dashboard");
  redirectNotesMessage(returnTo, "success", `${ids.length}개의 오답을 삭제했습니다.`);
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
  redirect("/notes?classification=reason");
}

export async function updateNoteExtractedContent(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const question = String(formData.get("question") ?? "").trim();
  const correctAnswer = String(formData.get("correctAnswer") ?? "").trim();
  const myAnswer = String(formData.get("myAnswer") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();

  if (
    !id ||
    !question ||
    !correctAnswer ||
    question.length > MAX_QUESTION_LENGTH ||
    correctAnswer.length > MAX_ANSWER_LENGTH ||
    myAnswer.length > MAX_ANSWER_LENGTH ||
    source.length > MAX_SOURCE_LENGTH
  ) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("notes")
    .update({
      question,
      correct_answer: correctAnswer,
      my_answer: myAnswer || null,
      source: source || null,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath(`/notes/${id}`);
  revalidatePath("/notes");
  revalidatePath("/review");
  revalidatePath("/dashboard");
  redirect("/notes?classification=reason");
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
    const schedule = reviewScheduleAfterResult(
      note.box_level,
      result === "correct",
    );
    await supabase
      .from("notes")
      .update({
        box_level: schedule.stage,
        next_review_at: schedule.nextReviewAt.toISOString(),
        mastered: schedule.mastered,
      })
      .eq("id", id)
      .eq("user_id", user.id);

    await supabase.from("review_logs").insert({ note_id: id, user_id: user.id, result });
  }

  revalidatePath("/review");
  revalidatePath("/dashboard");
  revalidatePath(`/notes/${id}`);
}
