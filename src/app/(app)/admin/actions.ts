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

export async function createManagedUser(formData: FormData) {
  const { admin } = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const dateOfBirth = String(formData.get("dateOfBirth") ?? "");
  const countryCode = String(formData.get("countryCode") ?? "KR").toUpperCase();

  if (!displayName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect(`/admin/users/new?error=${encodeURIComponent("이름과 올바른 이메일을 입력해 주세요.")}`);
  }
  if (password.length < 8) {
    redirect(`/admin/users/new?error=${encodeURIComponent("임시 비밀번호는 8자 이상이어야 합니다.")}`);
  }
  const birthDate = new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)
    || Number.isNaN(birthDate.getTime())
    || birthDate.toISOString().slice(0, 10) !== dateOfBirth
    || birthDate > new Date()
  ) {
    redirect(`/admin/users/new?error=${encodeURIComponent("올바른 생년월일을 입력해 주세요.")}`);
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: displayName,
      date_of_birth: dateOfBirth,
      country_code: countryCode,
      terms_version: "admin-created",
      privacy_version: "admin-created",
    },
  });
  if (error || !data.user) {
    redirect(`/admin/users/new?error=${encodeURIComponent(
      error?.message.includes("registered")
        ? "이미 가입된 이메일입니다."
        : "회원을 추가하지 못했습니다.",
    )}`);
  }

  revalidatePath("/admin");
  redirect(`/admin/users/${data.user.id}?success=${encodeURIComponent("회원 계정을 생성했습니다.")}`);
}

export async function updateManagedUser(formData: FormData) {
  const { admin, user } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const dateOfBirth = String(formData.get("dateOfBirth") ?? "");
  const countryCode = String(formData.get("countryCode") ?? "KR").toUpperCase();
  const accountStatus = String(formData.get("accountStatus") ?? "active");
  const guardianConsentStatus = String(formData.get("guardianConsentStatus") ?? "not_required");
  const detailUrl = `/admin/users/${encodeURIComponent(userId)}`;

  if (
    !userId
    || !displayName
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !["active", "suspended"].includes(accountStatus)
    || !["not_required", "pending", "granted", "withdrawn"].includes(guardianConsentStatus)
  ) {
    redirect(`${detailUrl}?error=${encodeURIComponent("회원 정보를 다시 확인해 주세요.")}`);
  }
  if (userId === user.id && accountStatus === "suspended") {
    redirect(`${detailUrl}?error=${encodeURIComponent("현재 관리자 계정은 정지할 수 없습니다.")}`);
  }

  const birthDate = new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)
    || Number.isNaN(birthDate.getTime())
    || birthDate.toISOString().slice(0, 10) !== dateOfBirth
    || birthDate > new Date()
  ) {
    redirect(`${detailUrl}?error=${encodeURIComponent("올바른 생년월일을 입력해 주세요.")}`);
  }

  const ageBoundary = new Date();
  ageBoundary.setUTCFullYear(ageBoundary.getUTCFullYear() - (countryCode === "KR" ? 19 : 18));
  const guardianRequired = birthDate > ageBoundary;
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
    user_metadata: {
      display_name: displayName,
      date_of_birth: dateOfBirth,
      country_code: countryCode,
    },
  });
  if (authError) {
    redirect(`${detailUrl}?error=${encodeURIComponent("인증 계정 정보를 변경하지 못했습니다.")}`);
  }

  const { error } = await admin
    .from("profiles")
    .update({
      email,
      display_name: displayName,
      date_of_birth: dateOfBirth,
      country_code: countryCode,
      account_status: accountStatus,
      guardian_required: guardianRequired,
      guardian_consent_status: guardianRequired ? guardianConsentStatus : "not_required",
    })
    .eq("id", userId);
  if (error) {
    redirect(`${detailUrl}?error=${encodeURIComponent("회원 프로필을 변경하지 못했습니다.")}`);
  }

  revalidatePath("/admin");
  revalidatePath(detailUrl);
  redirect(`${detailUrl}?success=${encodeURIComponent("회원 정보를 저장했습니다.")}`);
}

export async function resetManagedUserPassword(formData: FormData) {
  const { admin } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  const detailUrl = `/admin/users/${encodeURIComponent(userId)}`;

  if (!userId || password.length < 8 || password !== passwordConfirm) {
    redirect(`${detailUrl}?error=${encodeURIComponent("임시 비밀번호는 8자 이상이며 확인 값과 일치해야 합니다.")}`);
  }
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) {
    redirect(`${detailUrl}?error=${encodeURIComponent("임시 비밀번호를 설정하지 못했습니다.")}`);
  }
  redirect(`${detailUrl}?success=${encodeURIComponent("임시 비밀번호를 설정했습니다. 사용자에게 안전하게 전달해 주세요.")}`);
}

export async function updateGuardianLink(formData: FormData) {
  const { admin } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const linkId = String(formData.get("linkId") ?? "");
  const status = String(formData.get("status") ?? "");
  const relationship = String(formData.get("relationship") ?? "");
  const detailUrl = `/admin/users/${encodeURIComponent(userId)}`;

  if (
    !userId
    || !linkId
    || !["pending", "active", "rejected", "revoked"].includes(status)
    || !["parent", "legal_guardian", "other"].includes(relationship)
  ) {
    redirect(`${detailUrl}?error=${encodeURIComponent("보호자 연결 정보를 다시 확인해 주세요.")}`);
  }

  const { error } = await admin
    .from("guardian_links")
    .update({
      status,
      relationship,
      can_view_learning: formData.get("canViewLearning") === "on",
      can_manage_account: formData.get("canManageAccount") === "on",
      can_manage_billing: formData.get("canManageBilling") === "on",
      accepted_at: status === "active" ? new Date().toISOString() : null,
      revoked_at: status === "revoked" ? new Date().toISOString() : null,
    })
    .eq("id", linkId);
  if (error) {
    redirect(`${detailUrl}?error=${encodeURIComponent("보호자 연결 정보를 저장하지 못했습니다.")}`);
  }

  revalidatePath("/admin");
  revalidatePath(detailUrl);
  redirect(`${detailUrl}?success=${encodeURIComponent("보호자 연결 권한을 저장했습니다.")}`);
}

export async function createGuardianLink(formData: FormData) {
  const { admin, user } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const relatedUserId = String(formData.get("relatedUserId") ?? "");
  const relatedRole = String(formData.get("relatedRole") ?? "");
  const relationship = String(formData.get("relationship") ?? "parent");
  const detailUrl = `/admin/users/${encodeURIComponent(userId)}`;

  if (
    !userId
    || !relatedUserId
    || userId === relatedUserId
    || !["guardian", "child"].includes(relatedRole)
    || !["parent", "legal_guardian", "other"].includes(relationship)
  ) {
    redirect(`${detailUrl}?error=${encodeURIComponent("연결할 회원과 역할을 다시 확인해 주세요.")}`);
  }

  const childUserId = relatedRole === "guardian" ? userId : relatedUserId;
  const guardianUserId = relatedRole === "guardian" ? relatedUserId : userId;
  const { data: parties, error: partiesError } = await admin
    .from("profiles")
    .select("id, guardian_required")
    .in("id", [childUserId, guardianUserId]);

  if (partiesError || parties?.length !== 2) {
    redirect(`${detailUrl}?error=${encodeURIComponent("연결할 회원 정보를 찾을 수 없습니다.")}`);
  }

  const guardianProfile = parties.find((party) => party.id === guardianUserId);
  if (guardianProfile?.guardian_required) {
    redirect(`${detailUrl}?error=${encodeURIComponent("미성년 학습자 계정은 보호자로 지정할 수 없습니다.")}`);
  }

  const acceptedAt = new Date().toISOString();
  const { error } = await admin.from("guardian_links").upsert(
    {
      child_user_id: childUserId,
      guardian_user_id: guardianUserId,
      relationship,
      status: "active",
      can_view_learning: true,
      can_manage_account: true,
      can_manage_billing: true,
      invited_by: user.id,
      accepted_at: acceptedAt,
      revoked_at: null,
    },
    { onConflict: "child_user_id,guardian_user_id" },
  );

  if (error) {
    redirect(`${detailUrl}?error=${encodeURIComponent("보호자·자녀 연결을 저장하지 못했습니다.")}`);
  }

  await admin
    .from("profiles")
    .update({
      guardian_required: true,
      guardian_consent_status: "granted",
      guardian_consent_granted_at: acceptedAt,
      guardian_consent_granted_by: guardianUserId,
    })
    .eq("id", childUserId);

  await admin.from("guardian_activity_logs").insert({
    actor_user_id: user.id,
    child_user_id: childUserId,
    action: "admin_guardian_connection_created",
    metadata: { guardian_user_id: guardianUserId },
  });

  revalidatePath("/admin");
  revalidatePath(detailUrl);
  redirect(`${detailUrl}?success=${encodeURIComponent("보호자·자녀 계정을 연결했습니다.")}`);
}

export async function deleteGuardianLink(formData: FormData) {
  const { admin, user } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const linkId = String(formData.get("linkId") ?? "");
  const detailUrl = `/admin/users/${encodeURIComponent(userId)}`;

  const { data: link } = await admin
    .from("guardian_links")
    .select("child_user_id, guardian_user_id")
    .eq("id", linkId)
    .maybeSingle();

  if (
    !userId
    || !link
    || (link.child_user_id !== userId && link.guardian_user_id !== userId)
  ) {
    redirect(`${detailUrl}?error=${encodeURIComponent("삭제할 가족 연결을 찾을 수 없습니다.")}`);
  }

  const { error } = await admin.from("guardian_links").delete().eq("id", linkId);
  if (error) {
    redirect(`${detailUrl}?error=${encodeURIComponent("가족 연결을 해제하지 못했습니다.")}`);
  }

  const { count: activeGuardianCount } = await admin
    .from("guardian_links")
    .select("id", { count: "exact", head: true })
    .eq("child_user_id", link.child_user_id)
    .eq("status", "active");

  if (!activeGuardianCount) {
    await admin
      .from("profiles")
      .update({
        guardian_consent_status: "pending",
        guardian_consent_granted_at: null,
        guardian_consent_granted_by: null,
      })
      .eq("id", link.child_user_id)
      .eq("guardian_required", true);
  }

  await admin.from("guardian_activity_logs").insert({
    actor_user_id: user.id,
    child_user_id: link.child_user_id,
    action: "admin_guardian_connection_deleted",
    metadata: { guardian_user_id: link.guardian_user_id },
  });

  revalidatePath("/admin");
  revalidatePath(detailUrl);
  redirect(`${detailUrl}?success=${encodeURIComponent("보호자·자녀 연결을 해제했습니다.")}`);
}

export async function deleteManagedUser(formData: FormData) {
  const { admin, user } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const confirmationEmail = String(formData.get("confirmationEmail") ?? "")
    .trim()
    .toLowerCase();
  const detailUrl = `/admin/users/${encodeURIComponent(userId)}`;

  if (!userId || userId === user.id) {
    redirect(`${detailUrl}?error=${encodeURIComponent("현재 로그인한 관리자 계정은 삭제할 수 없습니다.")}`);
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.email || confirmationEmail !== profile.email.toLowerCase()) {
    redirect(`${detailUrl}?error=${encodeURIComponent("회원 이메일을 정확히 입력해야 삭제할 수 있습니다.")}`);
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    redirect(`${detailUrl}?error=${encodeURIComponent(
      error.message.includes("Storage")
        ? "회원이 소유한 저장 파일을 먼저 정리해야 합니다."
        : "회원 계정을 삭제하지 못했습니다.",
    )}`);
  }

  revalidatePath("/admin");
  redirect(`/admin?success=${encodeURIComponent("회원 계정과 연결된 데이터를 삭제했습니다.")}#members`);
}
