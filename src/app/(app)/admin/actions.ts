"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (user.app_metadata?.role !== "admin") redirect("/dashboard");

  return { admin: createAdminClient(), user };
}

function adminError(message: string): never {
  redirect(`/admin?error=${encodeURIComponent(message)}`);
}

export async function updateUserPlan(formData: FormData) {
  const { admin } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const planId = String(formData.get("planId") ?? "");
  const status = String(formData.get("status") ?? "active");

  if (
    !userId ||
    !planId ||
    !["trialing", "active", "past_due", "canceled", "paused"].includes(status)
  ) {
    adminError("올바르지 않은 구독 변경 요청입니다.");
  }

  const { data: existingSubscription, error: readError } = await admin
    .from("subscriptions")
    .select("payer_user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) adminError(readError.message);

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setUTCDate(periodEnd.getUTCDate() + 30);

  const { error } = await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      payer_user_id: existingSubscription?.payer_user_id ?? userId,
      plan_id: planId,
      status,
      provider: "manual",
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: status === "canceled",
    },
    { onConflict: "user_id" },
  );

  if (error) adminError(error.message);
  revalidatePath("/admin");
  revalidatePath("/billing");
  revalidatePath("/settings");
}

export async function updateAccountStatus(formData: FormData) {
  const { admin, user } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const accountStatus = String(formData.get("accountStatus") ?? "");

  if (!userId || !["active", "suspended"].includes(accountStatus)) {
    adminError("올바르지 않은 계정 상태입니다.");
  }
  if (userId === user.id && accountStatus === "suspended") {
    adminError("현재 로그인한 관리자 계정은 정지할 수 없습니다.");
  }

  const { error } = await admin
    .from("profiles")
    .update({ account_status: accountStatus })
    .eq("id", userId);

  if (error) adminError(error.message);
  revalidatePath("/admin");
}

export async function resolveDeletionRequest(formData: FormData) {
  const { admin, user } = await requireAdmin();
  const requestId = String(formData.get("requestId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (
    !requestId ||
    !["processing", "completed", "canceled"].includes(status)
  ) {
    adminError("올바르지 않은 삭제 요청 상태입니다.");
  }

  const { error } = await admin
    .from("account_deletion_requests")
    .update({
      status,
      resolved_by: user.id,
      resolved_at:
        status === "completed" || status === "canceled"
          ? new Date().toISOString()
          : null,
    })
    .eq("id", requestId);

  if (error) adminError(error.message);
  revalidatePath("/admin");
}
