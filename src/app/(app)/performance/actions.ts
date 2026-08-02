"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { finalizeAiUsage, reserveAiUsage, usageErrorMessage } from "@/lib/billing";
import { generatePerformanceReport, getPerformanceAccess } from "@/lib/performance";
import { extractScoreReport, type ExtractedScoreReport } from "@/lib/score-report";
import { createClient } from "@/lib/supabase/server";

const SCHOOL_LEVELS = ["elementary", "middle", "high", "university", "adult"] as const;
const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FILE_BYTES = 15 * 1024 * 1024;

async function requirePerformanceAccess() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const access = await getPerformanceAccess(user);
  if (!access.allowed) redirect("/dashboard?notice=performance-coming-soon");
  return { supabase, user };
}

function performanceError(message: string): never {
  redirect(`/performance?error=${encodeURIComponent(message)}`);
}

export async function savePerformanceConsent(formData: FormData) {
  const { supabase, user } = await requirePerformanceAccess();
  const benchmarkEnabled = formData.get("benchmarkEnabled") === "on";
  const regionalEnabled = formData.get("regionalEnabled") === "on";
  const ocrEnabled = formData.get("ocrEnabled") === "on";
  const now = new Date().toISOString();

  const { error } = await supabase.from("performance_consents").upsert({
    user_id: user.id,
    benchmark_enabled: benchmarkEnabled,
    regional_comparison_enabled: benchmarkEnabled && regionalEnabled,
    score_report_ocr_enabled: ocrEnabled,
    consent_version: "2026-08-02",
    consented_at: benchmarkEnabled || ocrEnabled ? now : null,
    withdrawn_at: benchmarkEnabled || ocrEnabled ? null : now,
  });
  if (error) performanceError("비교 분석 동의를 저장하지 못했습니다.");
  revalidatePath("/performance");
  redirect("/performance?success=" + encodeURIComponent("데이터 활용 설정을 저장했습니다."));
}

export async function createExamResult(formData: FormData) {
  const { supabase, user } = await requirePerformanceAccess();
  const input = parseExamResultForm(formData);
  if (!input) performanceError("성적 입력 내용을 다시 확인해 주세요.");

  const { data: result, error } = await supabase
    .from("exam_results")
    .insert({ user_id: user.id, ...input, source_type: "manual", verification_status: "self_reported" })
    .select("id")
    .single();
  if (error || !result) performanceError(error?.message ?? "성적을 저장하지 못했습니다.");

  const noteIds = formData
    .getAll("noteIds")
    .map(String)
    .filter((value) => /^[0-9a-f-]{36}$/i.test(value))
    .slice(0, 100);
  if (noteIds.length > 0) {
    const { data: ownedNotes } = await supabase
      .from("notes")
      .select("id")
      .eq("user_id", user.id)
      .in("id", noteIds);
    if (ownedNotes?.length) {
      await supabase.from("exam_result_notes").insert(
        ownedNotes.map((note) => ({ exam_result_id: result.id, note_id: note.id, user_id: user.id })),
      );
    }
  }

  try {
    await generatePerformanceReport(result.id);
  } catch (error) {
    console.error("generatePerformanceReport failed:", error);
  }
  revalidatePath("/performance");
  revalidatePath("/admin/performance");
  redirect("/performance?success=" + encodeURIComponent("성적과 비교 분석 결과를 저장했습니다."));
}

export async function createExamResultFromScoreReport(formData: FormData) {
  const { supabase, user } = await requirePerformanceAccess();
  const fileValue = formData.get("scoreReport");
  if (!(fileValue instanceof File) || fileValue.size === 0) {
    performanceError("성적표 사진 또는 PDF를 선택해 주세요.");
  }
  const file = fileValue as File;
  if (!ALLOWED_FILE_TYPES.includes(file.type) || file.size > MAX_FILE_BYTES) {
    performanceError("15MB 이하의 JPG, PNG, WEBP 또는 PDF만 올릴 수 있습니다.");
  }

  const { data: consent } = await supabase
    .from("performance_consents")
    .select("score_report_ocr_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!consent?.score_report_ocr_enabled && user.app_metadata?.role !== "admin") {
    performanceError("성적표 AI 인식을 사용하려면 먼저 데이터 활용 설정에 동의해 주세요.");
  }

  const safeName = file.name.normalize("NFKC").replace(/[^a-zA-Z0-9._가-힣-]/g, "_").slice(-120);
  const path = `${user.id}/score-reports/${crypto.randomUUID()}-${safeName || "score-report"}`;
  const buffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("note-files")
    .upload(path, buffer, { contentType: file.type });
  if (uploadError) performanceError("성적표 파일을 안전하게 저장하지 못했습니다.");

  const { data: importRow, error: importError } = await supabase
    .from("score_report_imports")
    .insert({
      user_id: user.id,
      file_path: path,
      file_name: file.name,
      mime_type: file.type,
      file_size_bytes: file.size,
      status: "processing",
    })
    .select("id")
    .single();
  if (importError || !importRow) {
    await supabase.storage.from("note-files").remove([path]);
    performanceError("성적표 처리 기록을 만들지 못했습니다.");
  }

  const reservation = await reserveAiUsage(user.id, "file_analysis");
  if (!reservation.allowed) {
    await markImportFailed(supabase, importRow.id, usageErrorMessage(reservation.reason));
    performanceError(usageErrorMessage(reservation.reason));
  }

  let extracted: ExtractedScoreReport;
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const result = await extractScoreReport({
      fileBase64: Buffer.from(buffer).toString("base64"),
      mimeType: file.type,
      filename: file.name,
    });
    extracted = result.data;
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
  } catch (error) {
    console.error("extractScoreReport failed:", error);
    await finalizeAiUsage({
      userId: user.id,
      requestKey: reservation.requestKey,
      succeeded: false,
      failureReason: "score report extraction failed",
    });
    await markImportFailed(supabase, importRow.id, "성적표에서 점수를 읽지 못했습니다.");
    performanceError("성적표에서 점수를 읽지 못했습니다. 직접 입력을 이용해 주세요.");
  }

  await finalizeAiUsage({
    userId: user.id,
    requestKey: reservation.requestKey,
    succeeded: true,
    inputTokens,
    outputTokens,
  });

  const regionCode = normalizeRegionCode(String(formData.get("regionCode") ?? "KR"));
  const { data: result, error } = await supabase
    .from("exam_results")
    .insert({
      user_id: user.id,
      subject_name: extracted.subjectName.slice(0, 80) || "미분류",
      school_level: extracted.schoolLevel,
      grade_level: extracted.gradeLevel.slice(0, 40) || "미확인",
      region_code: regionCode,
      exam_type: extracted.examType.slice(0, 60) || "시험",
      exam_name: extracted.examName.slice(0, 120) || "성적표 인식 시험",
      exam_date: validDate(extracted.examDate) ? extracted.examDate : new Date().toISOString().slice(0, 10),
      raw_score: extracted.rawScore,
      max_score: extracted.maxScore,
      exam_average_score: extracted.examAverageScore,
      percentile_rank: extracted.percentileRank,
      rank_position: extracted.rankPosition,
      examinee_count: extracted.examineeCount,
      question_count: extracted.questionCount,
      wrong_answer_count: extracted.wrongAnswerCount,
      source_type: "ocr",
      verification_status: "ai_extracted",
      report_file_path: path,
      extracted_payload: extracted,
    })
    .select("id")
    .single();
  if (error || !result) {
    await markImportFailed(supabase, importRow.id, error?.message ?? "성적 저장 실패");
    performanceError("인식한 성적을 저장하지 못했습니다.");
  }

  await supabase
    .from("score_report_imports")
    .update({
      status: "completed",
      extracted_payload: extracted,
      exam_result_id: result.id,
      completed_at: new Date().toISOString(),
    })
    .eq("id", importRow.id)
    .eq("user_id", user.id);
  try {
    await generatePerformanceReport(result.id);
  } catch (error) {
    console.error("generatePerformanceReport after OCR failed:", error);
  }

  revalidatePath("/performance");
  revalidatePath("/admin/performance");
  redirect("/performance?success=" + encodeURIComponent("성적표를 인식해 성적과 예측 결과를 저장했습니다."));
}

function parseExamResultForm(formData: FormData) {
  const schoolLevel = String(formData.get("schoolLevel") ?? "");
  const gradeLevel = String(formData.get("gradeLevel") ?? "").trim();
  const subjectName = String(formData.get("subjectName") ?? "").trim();
  const examType = String(formData.get("examType") ?? "").trim();
  const examName = String(formData.get("examName") ?? "").trim();
  const examDate = String(formData.get("examDate") ?? "");
  const rawScore = Number(formData.get("rawScore"));
  const maxScore = Number(formData.get("maxScore"));
  const questionCount = optionalInteger(formData.get("questionCount"));
  const wrongAnswerCount = optionalInteger(formData.get("wrongAnswerCount"));
  const examAverageScore = optionalNumber(formData.get("examAverageScore"));
  const percentileRank = optionalNumber(formData.get("percentileRank"));
  const rankPosition = optionalInteger(formData.get("rankPosition"));
  const examineeCount = optionalInteger(formData.get("examineeCount"));
  if (
    !SCHOOL_LEVELS.includes(schoolLevel as (typeof SCHOOL_LEVELS)[number]) ||
    !gradeLevel || !subjectName || !examType || !examName || !validDate(examDate) ||
    !Number.isFinite(rawScore) || !Number.isFinite(maxScore) || maxScore <= 0 || rawScore < 0 || rawScore > maxScore ||
    (questionCount !== null && questionCount <= 0) ||
    (wrongAnswerCount !== null && (wrongAnswerCount < 0 || (questionCount !== null && wrongAnswerCount > questionCount)))
  ) return null;
  return {
    subject_id: String(formData.get("subjectId") ?? "") || null,
    subject_name: subjectName.slice(0, 80),
    school_level: schoolLevel,
    grade_level: gradeLevel.slice(0, 40),
    region_code: normalizeRegionCode(String(formData.get("regionCode") ?? "KR")),
    exam_type: examType.slice(0, 60),
    exam_name: examName.slice(0, 120),
    exam_date: examDate,
    raw_score: rawScore,
    max_score: maxScore,
    question_count: questionCount,
    wrong_answer_count: wrongAnswerCount,
    exam_average_score: examAverageScore,
    percentile_rank: percentileRank,
    rank_position: rankPosition,
    examinee_count: examineeCount,
  };
}

function optionalNumber(value: FormDataEntryValue | null) {
  if (value === null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalInteger(value: FormDataEntryValue | null) {
  const parsed = optionalNumber(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : parsed === null ? null : Number.NaN;
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function normalizeRegionCode(value: string) {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
  return normalized || "KR";
}

async function markImportFailed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  importId: string,
  reason: string,
) {
  await supabase
    .from("score_report_imports")
    .update({ status: "failed", failure_reason: reason.slice(0, 500), completed_at: new Date().toISOString() })
    .eq("id", importId);
}
