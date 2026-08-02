import "server-only";

import { createAdminClient } from "./supabase/admin";

export const PERFORMANCE_FEATURE_KEY = "performance_benchmarking";
export const MIN_PUBLIC_COHORT_SIZE = 30;

export function scoreBand(scorePercent: number) {
  const low = Math.min(95, Math.max(0, Math.floor(scorePercent / 5) * 5));
  return { low, high: low + 5 };
}

export function confidenceForSample(sampleSize: number) {
  if (sampleSize < MIN_PUBLIC_COHORT_SIZE) return "insufficient" as const;
  if (sampleSize < 50) return "low" as const;
  if (sampleSize < 200) return "medium" as const;
  return "high" as const;
}

export async function getPerformanceAccess(user: {
  id: string;
  app_metadata?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  const isAdmin = user.app_metadata?.role === "admin";
  const [{ data: flag }, { data: subscription }] = await Promise.all([
    admin
      .from("product_feature_flags")
      .select("member_enabled, admin_preview_enabled")
      .eq("key", PERFORMANCE_FEATURE_KEY)
      .maybeSingle(),
    admin
      .from("subscriptions")
      .select("status, plans(performance_benchmarking_enabled)")
      .eq("user_id", user.id)
      .in("status", ["trialing", "active"])
      .maybeSingle(),
  ]);

  const rawPlan = subscription?.plans;
  const plan = Array.isArray(rawPlan) ? rawPlan[0] : rawPlan;
  const hasPaidEntitlement = Boolean(plan?.performance_benchmarking_enabled);
  return {
    isAdmin,
    hasPaidEntitlement,
    memberEnabled: Boolean(flag?.member_enabled),
    adminPreviewEnabled: flag?.admin_preview_enabled !== false,
    allowed:
      (isAdmin && flag?.admin_preview_enabled !== false) ||
      (Boolean(flag?.member_enabled) && hasPaidEntitlement),
  };
}

export async function generatePerformanceReport(examResultId: string) {
  const admin = createAdminClient();
  const { data: result, error } = await admin
    .from("exam_results")
    .select("*")
    .eq("id", examResultId)
    .single();
  if (error || !result) throw new Error("성적 정보를 찾을 수 없습니다.");

  const score = Number(result.score_percent);
  const band = scoreBand(score);
  const periodStart = new Date(result.exam_date);
  periodStart.setUTCFullYear(periodStart.getUTCFullYear() - 1);

  const baseQuery = () =>
    admin
      .from("benchmark_cohorts")
      .select("id, region_scope, sample_size, average_score, average_wrong_rate, error_breakdown, concept_breakdown, confidence_level")
      .eq("school_level", result.school_level)
      .eq("grade_level", result.grade_level)
      .eq("subject_name", result.subject_name)
      .eq("exam_type", result.exam_type)
      .lte("score_band_low", band.low)
      .gte("score_band_high", band.high)
      .gte("period_end", periodStart.toISOString().slice(0, 10))
      .order("period_end", { ascending: false })
      .order("sample_size", { ascending: false })
      .limit(1);

  const [nationalResult, regionalResult] = await Promise.all([
    baseQuery().eq("region_scope", "national").eq("region_code", "KR").maybeSingle(),
    baseQuery().eq("region_scope", "region").eq("region_code", result.region_code).maybeSingle(),
  ]);
  const national = nationalResult.data;
  const regional = regionalResult.data;

  const nationalPercentile = percentileAgainstAverage(score, national?.average_score);
  const regionalPercentile = percentileAgainstAverage(score, regional?.average_score);
  const wrongRate = result.wrong_rate === null ? null : Number(result.wrong_rate);
  const reliableSample = Math.max(Number(national?.sample_size ?? 0), Number(regional?.sample_size ?? 0));
  const prediction = predictScore({
    score,
    wrongRate,
    cohortAverage: national?.average_score === null ? null : Number(national?.average_score),
    sampleSize: reliableSample,
  });

  const comparisonPayload = {
    label: "xonote 익명 사용자 기준",
    sampleSize: reliableSample,
    sampleNotice:
      reliableSample < MIN_PUBLIC_COHORT_SIZE
        ? "비교 표본을 수집 중입니다. 회원 화면에는 아직 노출되지 않습니다."
        : null,
    nationalAverageWrongRate: national?.average_wrong_rate ?? null,
    regionalAverageWrongRate: regional?.average_wrong_rate ?? null,
    errorBreakdown: national?.error_breakdown ?? {},
    conceptBreakdown: national?.concept_breakdown ?? {},
    recommendations: buildRecommendations(wrongRate, national?.average_wrong_rate),
  };

  const { data: report, error: reportError } = await admin
    .from("performance_reports")
    .upsert(
      {
        user_id: result.user_id,
        exam_result_id: result.id,
        national_cohort_id: national?.id ?? null,
        regional_cohort_id: regional?.id ?? null,
        national_percentile: nationalPercentile,
        regional_percentile: regionalPercentile,
        personal_wrong_rate: wrongRate,
        comparison_payload: comparisonPayload,
        predicted_score_low: prediction.low,
        predicted_score_high: prediction.high,
        prediction_confidence: prediction.confidence,
        model_version: "benchmark-v1",
        generated_at: new Date().toISOString(),
      },
      { onConflict: "exam_result_id" },
    )
    .select("id")
    .single();
  if (reportError) throw reportError;
  return report;
}

function percentileAgainstAverage(score: number, average: unknown) {
  if (average === null || average === undefined) return null;
  const distance = score - Number(average);
  return Math.min(99, Math.max(1, Math.round((50 + distance * 2) * 100) / 100));
}

function predictScore({
  score,
  wrongRate,
  cohortAverage,
  sampleSize,
}: {
  score: number;
  wrongRate: number | null;
  cohortAverage: number | null;
  sampleSize: number;
}) {
  const correction = wrongRate === null ? 0 : Math.min(6, Math.max(-2, (25 - wrongRate) * 0.12));
  const calibrated = cohortAverage === null ? score + correction : score * 0.8 + cohortAverage * 0.2 + correction;
  const margin = sampleSize >= 200 ? 3 : sampleSize >= 50 ? 5 : 8;
  return {
    low: Math.max(0, Math.round((calibrated - margin) * 10) / 10),
    high: Math.min(100, Math.round((calibrated + margin) * 10) / 10),
    confidence: confidenceForSample(sampleSize),
  };
}

function buildRecommendations(personalWrongRate: number | null, cohortWrongRate: unknown) {
  if (personalWrongRate === null) {
    return ["전체 문항 수와 오답 수를 입력하면 오답률 비교가 활성화됩니다."];
  }
  if (cohortWrongRate === null || cohortWrongRate === undefined) {
    return ["연결한 오답의 개념·오답 이유를 기준으로 우선 복습하세요."];
  }
  return personalWrongRate > Number(cohortWrongRate)
    ? ["유사 성적군보다 오답률이 높습니다. 취약 개념 복습과 유사 문제 반복을 우선하세요."]
    : ["유사 성적군보다 오답률이 낮습니다. 남은 오답의 재발 방지에 집중하세요."];
}
