"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (user.app_metadata?.role !== "admin") redirect("/dashboard");
  return { supabase, user };
}

export async function updateUserPlan(formData: FormData) {
  const { supabase } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const planId = String(formData.get("planId") ?? "");
  const status = String(formData.get("status") ?? "active");

  if (!userId || !planId || !["trialing", "active", "past_due", "canceled", "paused"].includes(status)) {
    redirect("/admin?error=" + encodeURIComponent("잘못된 구독 변경 요청입니다."));
  }

  const { error } = await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      plan_id: planId,
      status,
      provider: "manual",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) redirect("/admin?error=" + encodeURIComponent(error.message));
  revalidatePath("/admin");
  revalidatePath("/billing");
}

export async function updateAccountStatus(formData: FormData) {
  const { supabase } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const accountStatus = String(formData.get("accountStatus") ?? "");
  if (!userId || !["active", "suspended"].includes(accountStatus)) {
    redirect("/admin?error=" + encodeURIComponent("잘못된 계정 상태입니다."));
  }

  const { error } = await supabase
    .from("profiles")
    .update({ account_status: accountStatus })
    .eq("id", userId);
  if (error) redirect("/admin?error=" + encodeURIComponent(error.message));
  revalidatePath("/admin");
}

export async function resolveDeletionRequest(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const requestId = String(formData.get("requestId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!requestId || !["processing", "completed", "canceled"].includes(status)) {
    redirect("/admin?error=" + encodeURIComponent("잘못된 삭제 요청 상태입니다."));
  }

  const { error } = await supabase
    .from("account_deletion_requests")
    .update({
      status,
      resolved_by: user.id,
      resolved_at: status === "completed" || status === "canceled" ? new Date().toISOString() : null,
    })
    .eq("id", requestId);
  if (error) redirect("/admin?error=" + encodeURIComponent(error.message));
  revalidatePath("/admin");
}
