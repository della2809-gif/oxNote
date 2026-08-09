import "server-only";

import { createClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type AiUsageKind = "text_analysis" | "file_analysis";

export type AiUsageReservation = {
  allowed: boolean;
  requestKey: string;
  monthlyLimit: number;
  used: number;
  reason: string;
};

export type UserEntitlements = {
  planId: string;
  planName: string;
  monthlyAiCredits: number;
  maxFileBytes: number;
  monthlyStorageBytes: number;
};

const FREE_ENTITLEMENTS: UserEntitlements = {
  planId: "free",
  planName: "Free",
  monthlyAiCredits: 10,
  maxFileBytes: 5 * 1024 * 1024,
  monthlyStorageBytes: 50 * 1024 * 1024,
};

export async function getUserEntitlements(
  userId: string,
  existingClient?: ServerSupabaseClient,
): Promise<UserEntitlements> {
  try {
    const supabase = existingClient ?? (await createClient());
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("status, plans(id, name, monthly_ai_credits, max_file_bytes, monthly_storage_bytes)")
      .eq("user_id", userId)
      .in("status", ["trialing", "active"])
      .maybeSingle();

    const rawPlan = subscription?.plans;
    const plan = Array.isArray(rawPlan) ? rawPlan[0] : rawPlan;
    if (!plan) return FREE_ENTITLEMENTS;

    return {
      planId: String(plan.id),
      planName: String(plan.name),
      monthlyAiCredits: Number(plan.monthly_ai_credits),
      maxFileBytes: Number(plan.max_file_bytes),
      monthlyStorageBytes: Number(plan.monthly_storage_bytes),
    };
  } catch {
    return FREE_ENTITLEMENTS;
  }
}

export async function getMonthlyUploadedBytes(
  userId: string,
  existingClient?: ServerSupabaseClient,
): Promise<number> {
  try {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const supabase = existingClient ?? (await createClient());
    const { data, error } = await supabase
      .from("notes")
      .select("source_file_size_bytes")
      .eq("user_id", userId)
      .gte("created_at", monthStart.toISOString())
      .not("source_file_size_bytes", "is", null);
    if (error) throw error;
    return (data ?? []).reduce((sum, note) => sum + Number(note.source_file_size_bytes ?? 0), 0);
  } catch {
    return 0;
  }
}

export async function reserveAiUsage(
  userId: string,
  kind: AiUsageKind,
  existingClient?: ServerSupabaseClient,
  requestedKey?: string,
): Promise<AiUsageReservation> {
  const requestKey = requestedKey && requestedKey.length >= 8
    ? requestedKey.slice(0, 120)
    : crypto.randomUUID();

  try {
    const supabase = existingClient ?? (await createClient());
    const { data, error } = await supabase.rpc("reserve_ai_usage", {
      target_user_id: userId,
      target_request_key: requestKey,
      target_kind: kind,
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed: Boolean(row?.allowed),
      requestKey,
      monthlyLimit: Number(row?.monthly_limit ?? 0),
      used: Number(row?.used ?? 0),
      reason: String(row?.reason ?? "unknown"),
    };
  } catch (error) {
    console.error("reserveAiUsage failed:", error);
    return {
      allowed: false,
      requestKey,
      monthlyLimit: 0,
      used: 0,
      reason: "billing_not_configured",
    };
  }
}

export async function finalizeAiUsage({
  userId,
  requestKey,
  succeeded,
  inputTokens,
  outputTokens,
  failureReason,
  existingClient,
}: {
  userId: string;
  requestKey: string;
  succeeded: boolean;
  inputTokens?: number;
  outputTokens?: number;
  failureReason?: string;
  existingClient?: ServerSupabaseClient;
}) {
  try {
    const supabase = existingClient ?? (await createClient());
    const { error } = await supabase.rpc("finalize_ai_usage", {
      target_user_id: userId,
      target_request_key: requestKey,
      target_status: succeeded ? "succeeded" : "failed",
      target_input_tokens: inputTokens ?? null,
      target_output_tokens: outputTokens ?? null,
      target_failure_reason: failureReason ?? null,
    });
    if (error) throw error;
  } catch (error) {
    console.error("finalizeAiUsage failed:", error);
  }
}

export function usageErrorMessage(reason: string) {
  switch (reason) {
    case "monthly_limit_reached":
      return "이번 달 AI 분석 횟수를 모두 사용했습니다. 요금제 페이지에서 사용량을 확인해 주세요.";
    case "rate_limited":
      return "짧은 시간에 요청이 많았습니다. 10분 후 다시 시도해 주세요.";
    case "account_suspended":
      return "현재 계정에서는 AI 분석을 사용할 수 없습니다. 고객지원에 문의해 주세요.";
    default:
      return "AI 사용량 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  }
}
