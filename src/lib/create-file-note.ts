import "server-only";

import { after } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { analyzeFromFile, type FileAnalysisResult } from "./analyze";
import { analysisCacheKey, readAnalysisCache, writeAnalysisCache } from "./ai-analysis-cache";
import { createAiPerformanceTracker } from "./ai-performance";
import { cleanProblemImage } from "./problem-image-cleanup";
import {
  finalizeAiUsage,
  getMonthlyUploadedBytes,
  getUserEntitlements,
  reserveAiUsage,
  usageErrorMessage,
} from "./billing";
import { GPT_FILE_MODEL } from "./openai";
import { initialReviewDate } from "./spaced-repetition";
import type { HandwritingArtifact, HandwritingPoint, HandwritingStroke } from "./types";

const ACCEPTED_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const SUBJECT_COLORS = ["#6366f1", "#ec4899", "#22c55e", "#f59e0b", "#06b6d4", "#a855f7", "#ef4444"];

export type FileNoteProgress = {
  stage: "preparing" | "cache" | "analyzing" | "recognizing" | "solving" | "saving" | "complete";
  message: string;
  preview?: {
    question?: string;
    correctAnswer?: string;
    analysis?: string;
    answerSummary?: string;
  };
};

export class FileNoteCreationError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "FileNoteCreationError";
  }
}

function readLearningStatus(formData: FormData) {
  const value = String(formData.get("learningStatus") ?? "");
  return value === "incorrect" || value === "correct_review" ? value : null;
}

function readHandwritingArtifact(formData: FormData): HandwritingArtifact | undefined {
  if (String(formData.get("inputMode") ?? "") !== "handwriting") return undefined;
  const raw = String(formData.get("handwritingStrokes") ?? "");
  if (!raw || raw.length > 1_500_000) throw new FileNoteCreationError("손글씨 데이터가 너무 크거나 비어 있습니다.");

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new FileNoteCreationError("손글씨 데이터를 읽을 수 없습니다. 다시 작성해 주세요.");
  }
  if (!value || typeof value !== "object") throw new FileNoteCreationError("손글씨 데이터 형식이 올바르지 않습니다.");
  const candidate = value as Partial<HandwritingArtifact>;
  if (candidate.kind !== "handwriting" || candidate.version !== 1 || !Array.isArray(candidate.strokes)) {
    throw new FileNoteCreationError("손글씨 데이터 형식이 올바르지 않습니다.");
  }
  if (candidate.strokes.length > 500) throw new FileNoteCreationError("손글씨 획이 너무 많습니다.");

  let pointCount = 0;
  const strokes: HandwritingStroke[] = candidate.strokes.map((stroke, index) => {
    if (!stroke || !Array.isArray(stroke.points)) throw new FileNoteCreationError("손글씨 획 데이터가 올바르지 않습니다.");
    pointCount += stroke.points.length;
    if (pointCount > 50_000) throw new FileNoteCreationError("손글씨 데이터가 너무 큽니다.");
    const points: HandwritingPoint[] = stroke.points.map((point) => {
      const x = Number(point.x);
      const y = Number(point.y);
      const pressure = Number(point.pressure);
      const timestamp = Number(point.timestamp);
      if (![x, y, pressure, timestamp].every(Number.isFinite)) {
        throw new FileNoteCreationError("손글씨 좌표 데이터가 올바르지 않습니다.");
      }
      return {
        x: Math.max(0, Math.min(1200, x)),
        y: Math.max(0, Math.min(800, y)),
        pressure: Math.max(0, Math.min(1, pressure)),
        timestamp: Math.max(0, timestamp),
      };
    });
    return {
      id: String(stroke.id || `stroke-${index}`).slice(0, 100),
      tool: stroke.tool === "eraser" ? "eraser" : "pen",
      pointerType: stroke.pointerType === "pen" || stroke.pointerType === "touch" ? stroke.pointerType : "mouse",
      color: typeof stroke.color === "string" ? stroke.color.slice(0, 20) : "#111827",
      width: Math.max(1, Math.min(40, Number(stroke.width) || 4)),
      points,
    };
  });
  if (!strokes.some((stroke) => stroke.points.length > 0)) throw new FileNoteCreationError("작성된 손글씨가 없습니다.");

  return {
    kind: "handwriting",
    version: 1,
    width: 1200,
    height: 800,
    strokes,
    recognizedText: String(formData.get("recognizedQuestionHint") ?? "").trim().slice(0, 10_000) || undefined,
    recognizedLatex: String(formData.get("recognizedLatex") ?? "").trim().slice(0, 10_000) || undefined,
  };
}

export async function lookupSubjectName(
  supabase: SupabaseClient,
  subjectId: string | null,
): Promise<string> {
  if (!subjectId) return "";
  const { data } = await supabase.from("subjects").select("name").eq("id", subjectId).single();
  return data?.name ?? "";
}

function normalizeAiSubject(rawSubject: string) {
  const normalized = rawSubject.trim().replace(/\s+/g, " ").slice(0, 40);
  const commonSubjects = ["국어", "영어", "수학", "과학", "사회", "한국사", "물리", "화학", "생명과학", "지구과학"];
  return commonSubjects.find((subject) => normalized.includes(subject)) ?? normalized;
}

function subjectColor(name: string) {
  const hash = Array.from(name).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return SUBJECT_COLORS[hash % SUBJECT_COLORS.length];
}

async function resolveSubjectId(
  supabase: SupabaseClient,
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

function safeStorageName(filename: string, fallback: string) {
  return filename
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._가-힣-]/g, "_")
    .slice(-120) || fallback;
}

function extractJsonStringField(buffer: string, field: string) {
  const marker = `"${field}"`;
  const markerIndex = buffer.indexOf(marker);
  if (markerIndex < 0) return undefined;
  const colonIndex = buffer.indexOf(":", markerIndex + marker.length);
  if (colonIndex < 0) return undefined;
  const quoteIndex = buffer.indexOf('"', colonIndex + 1);
  if (quoteIndex < 0) return undefined;

  let escaped = false;
  for (let index = quoteIndex + 1; index < buffer.length; index += 1) {
    const character = buffer[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      try {
        return JSON.parse(buffer.slice(quoteIndex, index + 1)) as string;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export async function createFileNote({
  supabase,
  user,
  formData,
  requestId,
  signal,
  onProgress,
}: {
  supabase: SupabaseClient;
  user: User;
  formData: FormData;
  requestId?: string;
  signal?: AbortSignal;
  onProgress?: (progress: FileNoteProgress) => void;
}) {
  const perf = createAiPerformanceTracker(requestId, { flow: "file_note", userId: user.id });
  onProgress?.({ stage: "preparing", message: "파일과 계정 정보를 확인하고 있어요." });

  const selectedFile = formData.get("file");
  const cameraFile = formData.get("cameraFile");
  const solutionFile = formData.get("solutionFile");
  const source = String(formData.get("source") ?? "").trim().slice(0, 500);
  const subjectId = String(formData.get("subjectId") ?? "") || null;
  const subjectNameHint = String(formData.get("subjectName") ?? "").trim().slice(0, 100);
  const myAnswerHint = String(formData.get("myAnswerHint") ?? "").trim().slice(0, 5_000);
  const correctAnswerHint = String(formData.get("correctAnswerHint") ?? "").trim().slice(0, 5_000);
  const handwritingArtifact = readHandwritingArtifact(formData);
  const recognizedQuestionHint = handwritingArtifact?.recognizedText ?? "";
  const recognizedLatex = handwritingArtifact?.recognizedLatex ?? "";
  const learningStatus = readLearningStatus(formData);
  const uploadedFile =
    selectedFile instanceof File && selectedFile.size > 0
      ? selectedFile
      : cameraFile instanceof File && cameraFile.size > 0
        ? cameraFile
        : null;
  const uploadedSolution = solutionFile instanceof File && solutionFile.size > 0 ? solutionFile : null;

  if (!myAnswerHint || !correctAnswerHint || !learningStatus) {
    throw new FileNoteCreationError("문제 상태, 내가 선택한 답, 정답을 모두 입력해 주세요.");
  }
  if (!uploadedFile) throw new FileNoteCreationError("업로드할 사진 또는 PDF 파일을 선택해주세요.");
  if (!ACCEPTED_FILE_TYPES.includes(uploadedFile.type)) {
    throw new FileNoteCreationError("사진(JPG/PNG/WEBP) 또는 PDF 파일만 업로드할 수 있습니다.");
  }
  if (uploadedSolution && !ACCEPTED_FILE_TYPES.includes(uploadedSolution.type)) {
    throw new FileNoteCreationError("학생 풀이도 사진(JPG/PNG/WEBP) 또는 PDF 파일만 올릴 수 있습니다.");
  }

  const bufferStartedAt = performance.now();
  const monthlyUploadedBytesPromise = getMonthlyUploadedBytes(user.id, supabase)
    .then((bytes) => ({ bytes, error: null as unknown }))
    .catch((error: unknown) => ({ bytes: 0, error }));
  const subjectNamePromise = subjectNameHint
    ? Promise.resolve(subjectNameHint)
    : lookupSubjectName(supabase, subjectId);
  const [entitlements, subjectName, arrayBuffer, solutionArrayBuffer] = await Promise.all([
    getUserEntitlements(user.id, supabase),
    subjectNamePromise,
    uploadedFile.arrayBuffer(),
    uploadedSolution ? uploadedSolution.arrayBuffer() : Promise.resolve(null),
  ]);
  perf.measure("prepare_parallel", bufferStartedAt, { fileBytes: uploadedFile.size });

  const planFileLimit = Math.min(entitlements.maxFileBytes, MAX_FILE_SIZE_BYTES);
  if (uploadedFile.size > planFileLimit || (uploadedSolution?.size ?? 0) > planFileLimit) {
    throw new FileNoteCreationError(`파일은 ${Math.floor(planFileLimit / 1024 / 1024)}MB 이하로 올려주세요.`, 413);
  }
  let requestedUploadBytes = uploadedFile.size + (uploadedSolution?.size ?? 0);

  const fileBase64 = Buffer.from(arrayBuffer).toString("base64");
  const solutionBase64 = solutionArrayBuffer ? Buffer.from(solutionArrayBuffer).toString("base64") : undefined;
  const cacheKey = analysisCacheKey([
    "file_analysis_v3_verbatim_question",
    user.id,
    uploadedFile.type,
    fileBase64,
    uploadedSolution?.type,
    solutionBase64,
    subjectName,
    myAnswerHint,
    correctAnswerHint,
    learningStatus,
    recognizedQuestionHint,
    recognizedLatex,
  ]);

  onProgress?.({ stage: "cache", message: "같은 문제의 기존 분석을 확인하고 있어요." });
  const cacheStartedAt = performance.now();
  const cached = await readAnalysisCache<FileAnalysisResult>(supabase, user.id, cacheKey);
  perf.measure("cache_lookup", cacheStartedAt, { cacheHit: Boolean(cached) });

  const problemPath = `${user.id}/${crypto.randomUUID()}-${safeStorageName(uploadedFile.name, "problem-file")}`;
  const solutionPath = uploadedSolution
    ? `${user.id}/${crypto.randomUUID()}-${safeStorageName(uploadedSolution.name, "student-solution")}`
    : null;
  const uploadStartedAt = performance.now();
  const uploadPromise = Promise.all([
    supabase.storage.from("note-files").upload(problemPath, arrayBuffer, { contentType: uploadedFile.type }),
    uploadedSolution && solutionArrayBuffer && solutionPath
      ? supabase.storage.from("note-files").upload(solutionPath, solutionArrayBuffer, { contentType: uploadedSolution.type })
      : Promise.resolve({ error: null }),
  ]);

  let reservation: Awaited<ReturnType<typeof reserveAiUsage>> | null = null;
  let latestPreview: FileNoteProgress["preview"] = {};
  let lastPreviewScanLength = 0;
  let analyzed: FileAnalysisResult;

  try {
    if (cached) {
      analyzed = cached;
      onProgress?.({
        stage: "solving",
        message: "저장된 분석을 바로 불러왔어요.",
        preview: {
          question: cached.question,
          correctAnswer: cached.correctAnswer,
          analysis: cached.analysis,
          answerSummary: cached.details.answerSummary,
        },
      });
    } else {
      reservation = await reserveAiUsage(user.id, "file_analysis", supabase, requestId);
      perf.mark("usage_reservation");
      if (!reservation.allowed) throw new FileNoteCreationError(usageErrorMessage(reservation.reason), reservation.reason === "rate_limited" ? 429 : 402);

      onProgress?.({ stage: "analyzing", message: "AI가 문제의 글자와 조건을 읽고 있어요." });
      const openAiStartedAt = performance.now();
      analyzed = await analyzeFromFile({
        fileBase64,
        mimeType: uploadedFile.type,
        filename: uploadedFile.name,
        subject: subjectName,
        myAnswerHint,
        correctAnswerHint,
        recognizedQuestionHint,
        recognizedLatex,
        learningStatus,
        studentSolutionBase64: solutionBase64,
        studentSolutionMimeType: uploadedSolution?.type,
        studentSolutionFilename: uploadedSolution?.name,
        runtime: {
          signal,
          onFirstToken: (elapsedMs) => {
            perf.measure("openai_first_token", openAiStartedAt, { firstTokenMs: Math.round(elapsedMs) });
            onProgress?.({ stage: "recognizing", message: "문제를 인식했어요. 핵심 풀이를 만들고 있어요." });
          },
          onDelta: ({ outputText }) => {
            if (outputText.length - lastPreviewScanLength < 192) return;
            lastPreviewScanLength = outputText.length;
            const nextPreview = {
              question: extractJsonStringField(outputText, "question"),
              correctAnswer: extractJsonStringField(outputText, "correct_answer"),
              analysis: extractJsonStringField(outputText, "analysis"),
              answerSummary: extractJsonStringField(outputText, "answer_summary"),
            };
            const changed = Object.entries(nextPreview).some(
              ([key, value]) => value && latestPreview?.[key as keyof typeof nextPreview] !== value,
            );
            if (changed) {
              latestPreview = { ...latestPreview, ...nextPreview };
              onProgress?.({ stage: "solving", message: "정답과 오답 원인을 정리하고 있어요.", preview: latestPreview });
            }
          },
        },
      });
      perf.measure("openai_complete", openAiStartedAt, {
        inputTokens: analyzed.usage.inputTokens,
        outputTokens: analyzed.usage.outputTokens,
      });
      latestPreview = {
        question: analyzed.question,
        correctAnswer: analyzed.correctAnswer,
        analysis: analyzed.analysis,
        answerSummary: analyzed.details.answerSummary,
      };
      onProgress?.({
        stage: "solving",
        message: "정답과 핵심 풀이를 확인해 주세요.",
        preview: latestPreview,
      });
    }
  } catch (error) {
    const [problemUpload, solutionUpload] = await uploadPromise;
    const uploadedPaths = [problemUpload.error ? null : problemPath, solutionUpload.error ? null : solutionPath].filter(
      (path): path is string => Boolean(path),
    );
    if (uploadedPaths.length > 0) await supabase.storage.from("note-files").remove(uploadedPaths);
    if (reservation) {
      await finalizeAiUsage({
        userId: user.id,
        requestKey: reservation.requestKey,
        succeeded: false,
        failureReason: signal?.aborted ? "OpenAI request aborted" : "OpenAI file analysis failed",
        existingClient: supabase,
      });
    }
    throw error;
  }

  if (recognizedQuestionHint) analyzed = { ...analyzed, question: recognizedQuestionHint };

  const cleanupStartedAt = performance.now();
  const cleanupPromise = cleanProblemImage({
    input: Buffer.from(arrayBuffer),
    mimeType: uploadedFile.type,
    problemRegion: analyzed.details.problemRegion,
  }).catch((error) => {
    console.error("Problem image cleanup failed:", error);
    return null;
  });
  const [problemUpload, solutionUpload, cleanedImage] = await Promise.all([
    uploadPromise.then((result) => result[0]),
    uploadPromise.then((result) => result[1]),
    cleanupPromise,
  ]);
  perf.measure("storage_upload", uploadStartedAt, {
    problemSucceeded: !problemUpload.error,
    solutionSucceeded: !solutionUpload.error,
  });
  const uploadedPaths = [
    problemUpload.error ? null : problemPath,
    solutionUpload.error ? null : solutionPath,
  ].filter((path): path is string => Boolean(path));
  let cleanedPath: string | null = null;
  if (cleanedImage && !problemUpload.error) {
    const candidatePath = `${user.id}/${crypto.randomUUID()}-cleaned-problem.webp`;
    const { error: cleanedUploadError } = await supabase.storage
      .from("note-files")
      .upload(candidatePath, cleanedImage.buffer, { contentType: "image/webp" });
    if (!cleanedUploadError) {
      cleanedPath = candidatePath;
      uploadedPaths.push(candidatePath);
      requestedUploadBytes += cleanedImage.buffer.byteLength;
    } else {
      console.error("Cleaned problem image upload failed:", cleanedUploadError);
    }
  }
  perf.measure("image_cleanup", cleanupStartedAt, { cleaned: Boolean(cleanedPath) });

  if (reservation) {
    after(() => finalizeAiUsage({
      userId: user.id,
      requestKey: reservation.requestKey,
      succeeded: analyzed.succeeded,
      inputTokens: analyzed.usage.inputTokens,
      outputTokens: analyzed.usage.outputTokens,
      existingClient: supabase,
    }));
  }

  if (signal?.aborted) {
    if (uploadedPaths.length > 0) await supabase.storage.from("note-files").remove(uploadedPaths);
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  const storageQuotaStartedAt = performance.now();
  const storageUsage = await monthlyUploadedBytesPromise;
  perf.measure("deferred_storage_quota", storageQuotaStartedAt);
  if (storageUsage.error) {
    if (uploadedPaths.length > 0) await supabase.storage.from("note-files").remove(uploadedPaths);
    throw new FileNoteCreationError("저장공간 사용량을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.", 503);
  }
  if (storageUsage.bytes + requestedUploadBytes > entitlements.monthlyStorageBytes) {
    if (uploadedPaths.length > 0) await supabase.storage.from("note-files").remove(uploadedPaths);
    throw new FileNoteCreationError(
      `${entitlements.planName} 플랜의 이번 달 파일 업로드 한도를 초과합니다.`,
      402,
    );
  }
  if (!analyzed.question || !analyzed.correctAnswer) {
    if (uploadedPaths.length > 0) await supabase.storage.from("note-files").remove(uploadedPaths);
    throw new FileNoteCreationError("파일에서 문제와 정답을 읽어내지 못했습니다. 직접 입력을 이용해주세요.", 422);
  }

  if (!cached) {
    after(() =>
      writeAnalysisCache(supabase, {
        userId: user.id,
        cacheKey,
        kind: "file_analysis",
        model: GPT_FILE_MODEL,
        result: analyzed,
      }),
    );
  }

  onProgress?.({ stage: "saving", message: "분석 결과를 오답노트에 저장하고 있어요.", preview: latestPreview });
  const saveStartedAt = performance.now();
  let saveResult;
  try {
    const resolvedSubjectId = await resolveSubjectId(supabase, user.id, subjectId, analyzed.details.subject);
    saveResult = await supabase
      .from("notes")
    .insert({
      user_id: user.id,
      subject_id: resolvedSubjectId,
      source: source || null,
      question: analyzed.question,
      my_answer: myAnswerHint || analyzed.myAnswer || null,
      correct_answer: correctAnswerHint || analyzed.correctAnswer,
      ai_analysis: analyzed.analysis,
      ai_details: {
        ...analyzed.details,
        ...(handwritingArtifact ? { inputArtifact: handwritingArtifact } : {}),
        ...(cleanedPath
          ? {
              imageCleanup: {
                version: 1,
                cleanedPath,
                mode: "crop_and_deink",
                problemRegion: analyzed.details.problemRegion,
              },
            }
          : {}),
      },
      mistake_type: analyzed.mistakeType,
      tags: [...analyzed.tags, learningStatus === "correct_review" ? "학습상태:맞았지만 복습" : "학습상태:틀린 문제"],
      box_level: 1,
      next_review_at: initialReviewDate().toISOString(),
      mastered: false,
      source_file_url: problemUpload.error ? null : problemPath,
      source_file_size_bytes: problemUpload.error ? null : uploadedFile.size,
      student_solution_file_url: solutionUpload.error ? null : solutionPath,
      student_solution_file_size_bytes: solutionUpload.error ? null : (uploadedSolution?.size ?? null),
    })
    .select("id")
      .single();
  } catch (error) {
    if (uploadedPaths.length > 0) await supabase.storage.from("note-files").remove(uploadedPaths);
    throw error;
  }
  perf.measure("db_save", saveStartedAt);

  if (saveResult.error || !saveResult.data) {
    if (uploadedPaths.length > 0) await supabase.storage.from("note-files").remove(uploadedPaths);
    throw new FileNoteCreationError(saveResult.error?.message ?? "저장에 실패했습니다.", 500);
  }

  const summary = perf.finish({ cacheHit: Boolean(cached), noteId: String(saveResult.data.id) });
  onProgress?.({ stage: "complete", message: "저장이 완료되었어요.", preview: latestPreview });
  return { noteId: String(saveResult.data.id), cacheHit: Boolean(cached), performance: summary };
}
