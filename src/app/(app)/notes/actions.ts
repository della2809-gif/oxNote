"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeFromText, type TextAnalysisResult } from "@/lib/analyze";
import { analysisCacheKey, readAnalysisCache, writeAnalysisCache } from "@/lib/ai-analysis-cache";
import { createAiPerformanceTracker } from "@/lib/ai-performance";
import {
  createFileNote,
  FileNoteCreationError,
  lookupSubjectName,
} from "@/lib/create-file-note";
import {
  finalizeAiUsage,
  reserveAiUsage,
  usageErrorMessage,
} from "@/lib/billing";
import { GPT_FAST_MODEL } from "@/lib/openai";
import {
  initialReviewDate,
  reviewScheduleAfterResult,
} from "@/lib/spaced-repetition";

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
export async function createNote(formData: FormData) {
  const perf = createAiPerformanceTracker(undefined, { flow: "text_note" });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  perf.mark("auth", { authenticated: Boolean(user) });
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
  perf.mark("subject_lookup");
  const cacheKey = analysisCacheKey([
    "text_analysis",
    user.id,
    subjectName,
    question,
    myAnswer,
    correctAnswer,
    learningStatus,
  ]);
  const cacheStartedAt = performance.now();
  const cached = await readAnalysisCache<TextAnalysisResult>(supabase, user.id, cacheKey);
  perf.measure("cache_lookup", cacheStartedAt, { cacheHit: Boolean(cached) });

  let reservation: Awaited<ReturnType<typeof reserveAiUsage>> | null = null;
  let analyzed: TextAnalysisResult;
  if (cached) {
    analyzed = cached;
  } else {
    reservation = await reserveAiUsage(user.id, "text_analysis", supabase);
    perf.mark("usage_reservation");
    if (!reservation.allowed) {
      redirect("/notes/new?error=" + encodeURIComponent(usageErrorMessage(reservation.reason)));
    }
    const openAiStartedAt = performance.now();
    analyzed = await analyzeFromText({
      question,
      myAnswer,
      correctAnswer,
      subject: subjectName,
      learningStatus,
      runtime: {
        onFirstToken: () => perf.measure("openai_first_token", openAiStartedAt),
      },
    });
    perf.measure("openai_complete", openAiStartedAt, {
      inputTokens: analyzed.usage.inputTokens,
      outputTokens: analyzed.usage.outputTokens,
    });
    after(() => writeAnalysisCache(supabase, {
      userId: user.id,
      cacheKey,
      kind: "text_analysis",
      model: GPT_FAST_MODEL,
      result: analyzed,
    }));
  }

  const saveStartedAt = performance.now();
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
  perf.measure("db_save", saveStartedAt);

  if (error || !data) {
    redirect("/notes/new?error=" + encodeURIComponent(error?.message ?? "저장에 실패했습니다."));
  }

  if (reservation) {
    after(() => finalizeAiUsage({
      userId: user.id,
      requestKey: reservation.requestKey,
      succeeded: analyzed.succeeded,
      inputTokens: analyzed.usage.inputTokens,
      outputTokens: analyzed.usage.outputTokens,
      failureReason: analyzed.succeeded ? undefined : "OpenAI text analysis failed",
      existingClient: supabase,
    }));
  }
  perf.finish({ cacheHit: Boolean(cached), noteId: String(data.id) });

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
  try {
    const result = await createFileNote({
      supabase,
      user,
      formData,
      requestId: String(formData.get("requestId") ?? "") || undefined,
    });
    revalidatePath("/notes");
    revalidatePath("/dashboard");
    redirect(`/notes/${result.noteId}`);
  } catch (error) {
    if (error instanceof FileNoteCreationError) {
      redirect("/notes/new?error=" + encodeURIComponent(error.message));
    }
    throw error;
  }
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
    .select("source_file_url, student_solution_file_url, ai_details")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const filesToRemove = [
    note?.source_file_url,
    note?.student_solution_file_url,
    (note?.ai_details as { imageCleanup?: { cleanedPath?: string } } | null)?.imageCleanup?.cleanedPath,
    ...(((note?.ai_details as { visualAssets?: { path?: string }[] } | null)?.visualAssets ?? []).map((asset) => asset.path)),
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
    .select("id, source_file_url, student_solution_file_url, ai_details")
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
        .flatMap((note) => [
          note.source_file_url,
          note.student_solution_file_url,
          (note.ai_details as { imageCleanup?: { cleanedPath?: string } } | null)?.imageCleanup?.cleanedPath,
          ...(((note.ai_details as { visualAssets?: { path?: string }[] } | null)?.visualAssets ?? []).map((asset) => asset.path)),
        ])
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

  const { data: existingNote, error: readError } = await supabase
    .from("notes")
    .select("ai_details")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError || !existingNote) {
    redirect(`/notes/${id}?error=${encodeURIComponent("오답 기록을 불러오지 못했습니다. 다시 시도해 주세요.")}`);
  }

  const aiDetails = existingNote.ai_details && typeof existingNote.ai_details === "object" && !Array.isArray(existingNote.ai_details)
    ? existingNote.ai_details as Record<string, unknown>
    : {};
  const confusionPoints = Array.isArray(aiDetails.confusionPoints)
    ? aiDetails.confusionPoints as { title?: string }[]
    : [];
  const previousSelections = Array.isArray(aiDetails.userConfusionSelections)
    ? aiDetails.userConfusionSelections as { stageIndex?: number; selectedAt?: string }[]
    : [];
  const selectedIndexes = Array.from(new Set(
    formData.getAll("confusionStage")
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0 && value < confusionPoints.length),
  ));
  const now = new Date().toISOString();
  const userConfusionSelections = selectedIndexes.map((stageIndex) => ({
    stageIndex,
    stageKey: `confusion-${stageIndex + 1}`,
    title: String(confusionPoints[stageIndex]?.title ?? `혼동 단계 ${stageIndex + 1}`),
    selectedAt: previousSelections.find((selection) => selection.stageIndex === stageIndex)?.selectedAt ?? now,
  }));

  const { data: updatedNote, error } = await supabase
    .from("notes")
    .update({
      user_mistake_reason: userMistakeReason || null,
      ai_details: { ...aiDetails, userConfusionSelections },
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error || !updatedNote) {
    redirect(`/notes/${id}?error=${encodeURIComponent("내가 틀린 이유를 저장하지 못했습니다. 다시 시도해 주세요.")}`);
  }

  revalidatePath(`/notes/${id}`);
  revalidatePath("/notes");
  redirect("/notes?success=" + encodeURIComponent("수정한 오답을 최신 목록에 반영했습니다."));
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

  const { data: updatedNote, error } = await supabase
    .from("notes")
    .update({
      question,
      correct_answer: correctAnswer,
      my_answer: myAnswer || null,
      source: source || null,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error || !updatedNote) {
    redirect(`/notes/${id}?error=${encodeURIComponent("수정 내용을 저장하지 못했습니다. 다시 시도해 주세요.")}`);
  }

  revalidatePath(`/notes/${id}`);
  revalidatePath("/notes");
  revalidatePath("/review");
  revalidatePath("/dashboard");
  redirect("/notes?success=" + encodeURIComponent("수정한 오답을 최신 목록에 반영했습니다."));
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
