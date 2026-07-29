"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return new URL(configured).origin;
  const vercelUrl = process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL;
  return vercelUrl ? `https://${vercelUrl}` : "http://localhost:3000";
}

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, "");
}

export async function createFamilyInvitation(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const direction = String(formData.get("direction") ?? "");
  const channel = String(formData.get("channel") ?? "email");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const relationship = String(formData.get("relationship") ?? "parent");
  const childName = String(formData.get("childName") ?? "").trim();
  const childDateOfBirth = String(formData.get("childDateOfBirth") ?? "");
  const createChildAccount = formData.get("createChildAccount") === "on";

  if (!["child_invites_guardian", "guardian_invites_child"].includes(direction)) {
    redirect("/settings?error=" + encodeURIComponent("올바른 초대 유형을 선택해 주세요."));
  }
  if (channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect("/settings?error=" + encodeURIComponent("초대할 이메일을 확인해 주세요."));
  }
  if (channel === "sms" && !/^\+?\d{9,15}$/.test(phone)) {
    redirect("/settings?error=" + encodeURIComponent("국가번호를 포함한 휴대전화 번호를 입력해 주세요."));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("guardian_required")
    .eq("id", user.id)
    .single();
  if (direction === "child_invites_guardian" && !profile?.guardian_required) {
    redirect("/settings?error=" + encodeURIComponent("보호자 동의가 필요한 학습자만 보호자를 초대할 수 있습니다."));
  }
  if (direction === "guardian_invites_child" && profile?.guardian_required) {
    redirect("/settings?error=" + encodeURIComponent("미성년 학습자 계정에서는 자녀를 추가할 수 없습니다."));
  }
  if (direction === "guardian_invites_child" && (!childName || !childDateOfBirth)) {
    redirect("/settings?error=" + encodeURIComponent("자녀 이름과 생년월일을 입력해 주세요."));
  }
  if (direction === "guardian_invites_child") {
    const parsedChildBirthDate = new Date(`${childDateOfBirth}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(childDateOfBirth)
      || Number.isNaN(parsedChildBirthDate.getTime())
      || parsedChildBirthDate.toISOString().slice(0, 10) !== childDateOfBirth
      || parsedChildBirthDate > new Date()
    ) {
      redirect("/settings?error=" + encodeURIComponent("올바른 자녀 생년월일을 입력해 주세요."));
    }
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const admin = createAdminClient();
  const invitation = {
    inviter_user_id: user.id,
    direction,
    channel,
    invitee_email: channel === "email" ? email : null,
    invitee_phone: channel === "sms" ? phone : null,
    child_user_id: direction === "child_invites_guardian" ? user.id : null,
    guardian_user_id: direction === "guardian_invites_child" ? user.id : null,
    child_name: direction === "guardian_invites_child" ? childName : null,
    child_date_of_birth: direction === "guardian_invites_child" ? childDateOfBirth : null,
    relationship,
    token_hash: tokenHash,
  };

  const { data: createdInvitation, error } = await admin
    .from("family_invitations")
    .insert(invitation)
    .select("id")
    .single();
  if (error) {
    redirect("/settings?error=" + encodeURIComponent("초대를 만들지 못했습니다. DB 마이그레이션 적용 상태를 확인해 주세요."));
  }

  const invitePath = `/guardian/invite/${token}`;
  const inviteUrl = `${siteUrl()}${invitePath}`;

  if (
    direction === "guardian_invites_child"
    && channel === "email"
    && createChildAccount
  ) {
    const { data, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(invitePath)}`,
      data: {
        display_name: childName,
        date_of_birth: childDateOfBirth,
        country_code: "KR",
        family_invitation_id: createdInvitation.id,
      },
    });
    if (inviteError) {
      await admin.from("family_invitations").delete().eq("id", createdInvitation.id);
      redirect("/settings?error=" + encodeURIComponent(
        inviteError.message.includes("already")
          ? "이미 가입된 이메일입니다. ‘기존 자녀 연결’ 방식으로 초대 링크를 보내 주세요."
          : "자녀 가입 메일을 보내지 못했습니다. Supabase 이메일 설정을 확인해 주세요.",
      ));
    }
    if (data.user) {
      await admin
        .from("family_invitations")
        .update({ child_user_id: data.user.id })
        .eq("id", createdInvitation.id);
    }
  }

  const params = new URLSearchParams({
    success: createChildAccount
      ? "자녀 가입 및 연결 초대 메일을 보냈습니다."
      : "초대 링크를 만들었습니다. 아래 버튼으로 전달해 주세요.",
    invite: inviteUrl,
    channel,
    contact: channel === "email" ? email : phone,
  });
  revalidatePath("/settings");
  redirect(`/settings?${params.toString()}`);
}

export async function sendFamilyInvitationEmail(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const inviteUrl = String(formData.get("inviteUrl") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect("/settings?error=" + encodeURIComponent("초대할 이메일을 확인해 주세요."));
  }

  let parsedInviteUrl: URL;
  try {
    parsedInviteUrl = new URL(inviteUrl);
  } catch {
    redirect("/settings?error=" + encodeURIComponent("올바른 초대 링크가 아닙니다."));
  }

  const expectedOrigin = new URL(siteUrl()).origin;
  const tokenMatch = parsedInviteUrl.pathname.match(/^\/guardian\/invite\/([A-Za-z0-9_-]+)$/);
  if (parsedInviteUrl.origin !== expectedOrigin || !tokenMatch) {
    redirect("/settings?error=" + encodeURIComponent("올바른 초대 링크가 아닙니다."));
  }

  const token = tokenMatch[1];
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const admin = createAdminClient();
  const { data: invitation } = await admin
    .from("family_invitations")
    .select("id, invitee_email")
    .eq("token_hash", tokenHash)
    .eq("inviter_user_id", user.id)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!invitation || invitation.invitee_email !== email) {
    redirect("/settings?error=" + encodeURIComponent("초대 정보가 만료되었거나 일치하지 않습니다."));
  }

  const invitePath = `/guardian/invite/${token}`;
  const { error } = await admin.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(invitePath)}`,
    },
  });

  const params = new URLSearchParams({
    invite: inviteUrl,
    channel: "email",
    contact: email,
  });
  if (error) {
    params.set(
      "error",
      error.code === "over_email_send_rate_limit"
        ? "이메일 발송 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요."
        : "초대 이메일을 보내지 못했습니다. Supabase 이메일 설정을 확인해 주세요.",
    );
  } else {
    params.set("success", `${email}로 보호자 초대 이메일을 보냈습니다.`);
  }

  redirect(`/settings?${params.toString()}`);
}

export async function requestAccountDeletion(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (confirmation !== "계정 삭제 요청") {
    redirect("/settings?error=" + encodeURIComponent("확인 문구를 정확히 입력해 주세요."));
  }

  const { error } = await supabase.from("account_deletion_requests").insert({
    user_id: user.id,
    reason: reason || null,
  });

  if (error) {
    redirect(
      "/settings?error=" +
        encodeURIComponent(
          error.code === "23505" ? "이미 처리 중인 계정 삭제 요청이 있습니다." : error.message,
        ),
    );
  }

  revalidatePath("/settings");
  redirect("/settings?success=" + encodeURIComponent("계정 삭제 요청을 접수했습니다."));
}
