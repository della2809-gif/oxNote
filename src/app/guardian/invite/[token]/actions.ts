"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function acceptFamilyInvitation(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const consent = formData.get("guardianConsent") === "on";
  const agreeTerms = formData.get("agreeTerms") === "on";
  const agreePrivacy = formData.get("agreePrivacy") === "on";
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  if (!token || !consent || !agreeTerms || !agreePrivacy) {
    redirect(`/guardian/invite/${encodeURIComponent(token)}?error=${encodeURIComponent("보호자 동의 및 연결 승인에 동의해 주세요.")}`);
  }
  if (password && (password.length < 8 || password !== passwordConfirm)) {
    redirect(`/guardian/invite/${encodeURIComponent(token)}?error=${encodeURIComponent("새 비밀번호는 8자 이상이며 확인 값과 일치해야 합니다.")}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/guardian/invite/${token}`)}`);
  }
  if (password) {
    const { error: passwordError } = await supabase.auth.updateUser({ password });
    if (passwordError) {
      redirect(`/guardian/invite/${encodeURIComponent(token)}?error=${encodeURIComponent("새 비밀번호를 설정하지 못했습니다.")}`);
    }
  }

  const admin = createAdminClient();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data: invitation } = await admin
    .from("family_invitations")
    .select("*")
    .eq("token_hash", tokenHash)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!invitation) {
    redirect(`/guardian/invite/${encodeURIComponent(token)}?error=${encodeURIComponent("초대가 만료되었거나 이미 사용되었습니다.")}`);
  }
  if (
    invitation.invitee_email
    && invitation.invitee_email !== user.email?.toLowerCase()
  ) {
    redirect(`/guardian/invite/${encodeURIComponent(token)}?error=${encodeURIComponent("초대받은 이메일 계정으로 로그인해 주세요.")}`);
  }

  let childUserId: string;
  let guardianUserId: string;
  if (invitation.direction === "child_invites_guardian") {
    childUserId = invitation.child_user_id;
    guardianUserId = user.id;
    const { data: guardianProfile } = await admin
      .from("profiles")
      .select("guardian_required")
      .eq("id", guardianUserId)
      .single();
    if (guardianProfile?.guardian_required) {
      redirect(`/guardian/invite/${encodeURIComponent(token)}?error=${encodeURIComponent("미성년 학습자 계정은 보호자로 승인할 수 없습니다.")}`);
    }
  } else {
    childUserId = user.id;
    guardianUserId = invitation.guardian_user_id;
  }

  if (!childUserId || !guardianUserId || childUserId === guardianUserId) {
    redirect(`/guardian/invite/${encodeURIComponent(token)}?error=${encodeURIComponent("연결할 계정 정보가 올바르지 않습니다.")}`);
  }

  const acceptedAt = new Date().toISOString();
  const { error: linkError } = await admin.from("guardian_links").upsert(
    {
      child_user_id: childUserId,
      guardian_user_id: guardianUserId,
      relationship: invitation.relationship,
      status: "active",
      can_view_learning: true,
      can_manage_account: true,
      can_manage_billing: true,
      invited_by: invitation.inviter_user_id,
      accepted_at: acceptedAt,
      revoked_at: null,
    },
    { onConflict: "child_user_id,guardian_user_id" },
  );
  if (linkError) {
    redirect(`/guardian/invite/${encodeURIComponent(token)}?error=${encodeURIComponent("보호자 연결을 저장하지 못했습니다.")}`);
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
  await admin
    .from("profiles")
    .update({
      terms_accepted_at: acceptedAt,
      privacy_accepted_at: acceptedAt,
      terms_version: "2026-07-28",
      privacy_version: "2026-07-28",
    })
    .eq("id", user.id);
  await admin
    .from("family_invitations")
    .update({
      status: "accepted",
      accepted_by: user.id,
      accepted_at: acceptedAt,
      child_user_id: childUserId,
      guardian_user_id: guardianUserId,
    })
    .eq("id", invitation.id)
    .eq("status", "pending");
  await admin.from("guardian_activity_logs").insert({
    actor_user_id: user.id,
    child_user_id: childUserId,
    action: "guardian_connection_accepted",
    metadata: { invitation_id: invitation.id },
  });

  redirect("/settings?success=" + encodeURIComponent("보호자와 자녀 계정 연결이 완료되었습니다."));
}
