import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type AcceptInvitationInput = {
  token: string;
  userId: string;
  userEmail?: string | null;
};

type AcceptInvitationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function acceptFamilyInvitationForUser({
  token,
  userId,
  userEmail,
}: AcceptInvitationInput): Promise<AcceptInvitationResult> {
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
    return { ok: false, error: "초대가 만료되었거나 이미 사용되었습니다." };
  }

  const normalizedEmail = userEmail?.trim().toLowerCase();
  if (invitation.invitee_email && invitation.invitee_email !== normalizedEmail) {
    return { ok: false, error: "초대받은 이메일 계정으로 로그인해 주세요." };
  }

  let childUserId: string;
  let guardianUserId: string;
  if (invitation.direction === "child_invites_guardian") {
    childUserId = invitation.child_user_id;
    guardianUserId = userId;
    const { data: guardianProfile } = await admin
      .from("profiles")
      .select("guardian_required")
      .eq("id", guardianUserId)
      .single();
    if (guardianProfile?.guardian_required) {
      return { ok: false, error: "미성년 학습자 계정은 보호자로 승인할 수 없습니다." };
    }
  } else {
    childUserId = userId;
    guardianUserId = invitation.guardian_user_id;
  }

  if (!childUserId || !guardianUserId || childUserId === guardianUserId) {
    return { ok: false, error: "연결할 계정 정보가 올바르지 않습니다." };
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
    return { ok: false, error: "보호자 연결을 저장하지 못했습니다." };
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

  const { data: acceptedInvitation } = await admin
    .from("family_invitations")
    .update({
      status: "accepted",
      accepted_by: userId,
      accepted_at: acceptedAt,
      child_user_id: childUserId,
      guardian_user_id: guardianUserId,
    })
    .eq("id", invitation.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (!acceptedInvitation) {
    return { ok: false, error: "초대가 이미 처리되었습니다." };
  }

  await admin.from("guardian_activity_logs").insert({
    actor_user_id: userId,
    child_user_id: childUserId,
    action: "guardian_connection_accepted",
    metadata: { invitation_id: invitation.id, accepted_via: "email" },
  });

  return { ok: true };
}
