"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { confidenceForSample, generatePerformanceReport, scoreBand } from "@/lib/performance";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type CohortExamResult = {
  id: string;
  user_id: string;
  school_level: string;
  grade_level: string;
  subject_name: string;
  exam_type: string;
  region_code: string;
  score_percent: number | string;
  wrong_rate: number | string | null;
  exam_date: string;
};

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.app_metadata?.role !== "admin") redirect("/dashboard");
  return { admin: createAdminClient(), user };
}

function adminRedirect(type: "error" | "success", message: string): never {
  redirect(`/admin/performance?${type}=${encodeURIComponent(message)}`);
}

export async function updatePerformanceRollout(formData: FormData) {
  const { admin, user } = await requireAdmin();
  const memberEnabled = formData.get("memberEnabled") === "on";
  const { error } = await admin
    .from("product_feature_flags")
    .update({ member_enabled: memberEnabled, admin_preview_enabled: true, updated_by: user.id })
    .eq("key", "performance_benchmarking");
  if (error) adminRedirect("error", "기능 공개 상태를 변경하지 못했습니다.");
  revalidatePath("/dashboard");
  revalidatePath("/admin/performance");
  adminRedirect("success", memberEnabled ? "유료회원에게 기능을 공개했습니다." : "회원 기능을 비활성화했습니다.");
}

export async function createBenchmarkSource(formData: FormData) {
  const { admin } = await requireAdmin();
  const code = String(formData.get("code") ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 60);
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const providerType = String(formData.get("providerType") ?? "public");
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim().slice(0, 500);
  const licenseNote = String(formData.get("licenseNote") ?? "").trim().slice(0, 1000);
  if (!code || !name || !["public", "partner"].includes(providerType)) {
    adminRedirect("error", "데이터 소스 정보를 다시 확인해 주세요.");
  }
  const { error } = await admin.from("benchmark_sources").upsert({
    code,
    name,
    provider_type: providerType,
    source_url: sourceUrl || null,
    license_note: licenseNote || null,
    is_active: true,
    imported_at: new Date().toISOString(),
  }, { onConflict: "code" });
  if (error) adminRedirect("error", error.message);
  revalidatePath("/admin/performance");
  adminRedirect("success", "공공·제휴 데이터 소스를 등록했습니다.");
}

export async function createReferenceCohort(formData: FormData) {
  const { admin } = await requireAdmin();
  const sourceId = String(formData.get("sourceId") ?? "");
  const scoreBandLow = Number(formData.get("scoreBandLow"));
  const scoreBandHigh = Number(formData.get("scoreBandHigh"));
  const sampleSize = Number(formData.get("sampleSize"));
  const averageScore = optionalNumber(formData.get("averageScore"));
  const averageWrongRate = optionalNumber(formData.get("averageWrongRate"));
  const schoolLevel = String(formData.get("schoolLevel") ?? "");
  const regionScope = String(formData.get("regionScope") ?? "national");
  const regionCode = regionScope === "national" ? "KR" : String(formData.get("regionCode") ?? "").trim().toUpperCase();
  if (!sourceId || !["elementary", "middle", "high", "university", "adult"].includes(schoolLevel) || !["national", "region"].includes(regionScope) || !regionCode || !Number.isFinite(sampleSize) || sampleSize < 0 || scoreBandLow < 0 || scoreBandHigh > 100 || scoreBandHigh <= scoreBandLow) {
    adminRedirect("error", "기준 집계 데이터의 필수 값을 확인해 주세요.");
  }
  const { error } = await admin.from("benchmark_cohorts").upsert({
    source_id: sourceId,
    school_level: schoolLevel,
    grade_level: String(formData.get("gradeLevel") ?? "").trim().slice(0, 40),
    subject_name: String(formData.get("subjectName") ?? "").trim().slice(0, 80),
    exam_type: String(formData.get("examType") ?? "").trim().slice(0, 60),
    region_scope: regionScope,
    region_code: regionCode,
    score_band_low: scoreBandLow,
    score_band_high: scoreBandHigh,
    period_start: String(formData.get("periodStart") ?? ""),
    period_end: String(formData.get("periodEnd") ?? ""),
    sample_size: sampleSize,
    average_score: averageScore,
    average_wrong_rate: averageWrongRate,
    confidence_level: confidenceForSample(sampleSize),
    refreshed_at: new Date().toISOString(),
  }, { onConflict: "source_id,school_level,grade_level,subject_name,exam_type,region_scope,region_code,score_band_low,score_band_high,period_start,period_end" });
  if (error) adminRedirect("error", error.message);
  revalidatePath("/admin/performance");
  adminRedirect("success", "외부 기준 집계 데이터를 반영했습니다.");
}

export async function rebuildInternalCohorts() {
  const { admin } = await requireAdmin();
  const [{ data: source }, { data: consents }] = await Promise.all([
    admin.from("benchmark_sources").select("id").eq("code", "xonote_internal").single(),
    admin.from("performance_consents").select("user_id").eq("benchmark_enabled", true),
  ]);
  if (!source) adminRedirect("error", "내부 데이터 소스를 찾지 못했습니다.");
  const consentingIds = (consents ?? []).map((item) => item.user_id);
  if (consentingIds.length === 0) adminRedirect("error", "익명 비교에 동의한 회원 데이터가 아직 없습니다.");

  const periodEnd = new Date();
  const periodStart = new Date(Date.UTC(periodEnd.getUTCFullYear() - 1, periodEnd.getUTCMonth(), 1));
  const { data: rawResults, error } = await admin
    .from("exam_results")
    .select("id, user_id, school_level, grade_level, subject_name, exam_type, region_code, score_percent, wrong_rate, exam_date")
    .in("user_id", consentingIds)
    .gte("exam_date", periodStart.toISOString().slice(0, 10));
  if (error) adminRedirect("error", error.message);
  const results = (rawResults ?? []) as CohortExamResult[];

  const resultIds = results.map((result) => result.id);
  const { data: linkedNotes } = resultIds.length
    ? await admin.from("exam_result_notes").select("exam_result_id, notes(mistake_type, tags)").in("exam_result_id", resultIds)
    : { data: [] as unknown[] };
  const notesByResult = new Map<string, Array<{ mistake_type?: string | null; tags?: string[] | null }>>();
  for (const link of (linkedNotes ?? []) as unknown as Array<{ exam_result_id: string; notes: { mistake_type?: string | null; tags?: string[] | null } | Array<{ mistake_type?: string | null; tags?: string[] | null }> | null }>) {
    const raw = Array.isArray(link.notes) ? link.notes[0] : link.notes;
    if (!raw) continue;
    const current = notesByResult.get(link.exam_result_id) ?? [];
    current.push(raw);
    notesByResult.set(link.exam_result_id, current);
  }

  const groups = new Map<string, { regionScope: "national" | "region"; regionCode: string; rows: CohortExamResult[] }>();
  for (const result of results) {
    const band = scoreBand(Number(result.score_percent));
    for (const target of [{ regionScope: "national" as const, regionCode: "KR" }, { regionScope: "region" as const, regionCode: result.region_code }]) {
      if (target.regionScope === "region" && target.regionCode === "KR") continue;
      const key = [result.school_level, result.grade_level, result.subject_name, result.exam_type, target.regionScope, target.regionCode, band.low, band.high].join("|");
      const group = groups.get(key) ?? { ...target, rows: [] };
      group.rows.push(result);
      groups.set(key, group);
    }
  }

  const { error: deleteError } = await admin.from("benchmark_cohorts").delete().eq("source_id", source.id);
  if (deleteError) adminRedirect("error", deleteError.message);

  const rows = Array.from(groups.values()).map((group) => {
    const first = group.rows[0];
    const band = scoreBand(Number(first.score_percent));
    const scores = group.rows.map((row) => Number(row.score_percent)).sort((a, b) => a - b);
    const wrongRates = group.rows.filter((row) => row.wrong_rate !== null).map((row) => Number(row.wrong_rate));
    const errorCounts = new Map<string, number>();
    const conceptCounts = new Map<string, number>();
    for (const row of group.rows) {
      for (const note of notesByResult.get(row.id) ?? []) {
        if (note.mistake_type) errorCounts.set(note.mistake_type, (errorCounts.get(note.mistake_type) ?? 0) + 1);
        for (const tag of note.tags ?? []) conceptCounts.set(tag, (conceptCounts.get(tag) ?? 0) + 1);
      }
    }
    return {
      source_id: source.id,
      school_level: first.school_level,
      grade_level: first.grade_level,
      subject_name: first.subject_name,
      exam_type: first.exam_type,
      region_scope: group.regionScope,
      region_code: group.regionCode,
      score_band_low: band.low,
      score_band_high: band.high,
      period_start: periodStart.toISOString().slice(0, 10),
      period_end: periodEnd.toISOString().slice(0, 10),
      sample_size: group.rows.length,
      average_score: average(scores),
      average_wrong_rate: wrongRates.length ? average(wrongRates) : null,
      percentile_stats: { p25: percentile(scores, 0.25), p50: percentile(scores, 0.5), p75: percentile(scores, 0.75), p90: percentile(scores, 0.9) },
      error_breakdown: Object.fromEntries(errorCounts),
      concept_breakdown: Object.fromEntries(conceptCounts),
      confidence_level: confidenceForSample(group.rows.length),
      refreshed_at: new Date().toISOString(),
    };
  });
  if (rows.length) {
    const { error: insertError } = await admin.from("benchmark_cohorts").insert(rows);
    if (insertError) adminRedirect("error", insertError.message);
  }

  for (const result of results) {
    try { await generatePerformanceReport(result.id); } catch (reportError) { console.error("performance report rebuild failed", reportError); }
  }
  revalidatePath("/admin/performance");
  revalidatePath("/performance");
  adminRedirect("success", `${rows.length}개의 익명 비교군을 다시 만들고 예측 보고서를 갱신했습니다.`);
}

function optionalNumber(value: FormDataEntryValue | null) {
  if (value === null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function average(values: number[]) { return Math.round((values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)) * 100) / 100; }
function percentile(values: number[], ratio: number) { if (!values.length) return null; return values[Math.min(values.length - 1, Math.max(0, Math.round((values.length - 1) * ratio)))]; }
