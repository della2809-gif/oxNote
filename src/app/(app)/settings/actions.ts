"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type InvitationDirection =
  | "child_invites_guardian"
  | "guardian_invites_child";

type InvitationRecord = {
  id: string;
  direction: InvitationDirection;
  invitee_email: string;
  child_name: string | null;
  child_date_of_birth: string | null;
};

function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return new URL(configured).origin;
  const vercelUrl = process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL;
  return vercelUrl ? `https://${vercelUrl}` : "http://localhost:3000";
}

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, "");
}

async function findProfileByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, display_name, guardian_required")
    .ilike("email", email)
    .limit(2);

  if (error) {
    return { profile: null, error: "회원 이메일을 확인하지 못했습니다." };
  }
  if ((data ?? []).length > 1) {
    return {
      profile: null,
      error: "동일한 이메일의 회원 정보가 중복되어 있습니다. 고객지원에 문의해 주세요.",
    };
  }

  return { profile: data?.[0] ?? null, error: null };
}

function maskDisplayName(value: string | null) {
  const characters = Array.from(value?.trim() ?? "");
  if (characters.length === 0) return "이름 미등록";
  if (characters.length === 1) return `${characters[0]}*`;
  if (characters.length === 2) return `${characters[0]}*`;
  return `${characters[0]}${"*".repeat(characters.length - 2)}${characters.at(-1)}`;
}

export async function lookupFamilyInvitee(
  rawEmail: string,
  direction: InvitationDirection,
) {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: "error" as const, message: "올바른 이메일을 입력해 주세요." };
  }
  if (!["child_invites_guardian", "guardian_invites_child"].includes(direction)) {
    return { status: "error" as const, message: "올바른 연결 유형이 아닙니다." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error" as const, message: "로그인 후 다시 시도해 주세요." };
  }
  if (user.email?.trim().toLowerCase() === email) {
    return { status: "error" as const, message: "본인 이메일은 연결 대상으로 사용할 수 없습니다." };
  }

  const admin = createAdminClient();
  const { profile, error } = await findProfileByEmail(admin, email);
  if (error) return { status: "error" as const, message: error };
  if (!profile) {
    return {
      status: "not_found" as const,
      verificationKey: "new",
    };
  }
  if (direction === "child_invites_guardian" && profile.guardian_required) {
    return {
      status: "error" as const,
      message: "이 이메일은 보호자로 연결할 수 있는 성인 회원 계정이 아닙니다.",
    };
  }
  if (direction === "guardian_invites_child" && !profile.guardian_required) {
    return {
      status: "error" as const,
      message: "이 이메일은 미성년 학습자 계정으로 등록되어 있지 않습니다.",
    };
  }

  return {
    status: "found" as const,
    maskedName: maskDisplayName(profile.display_name),
    verificationKey: profile.id,
  };
}

async function sendInvitationByAccountStatus({
  admin,
  invitation,
  token,
}: {
  admin: ReturnType<typeof createAdminClient>;
  invitation: InvitationRecord;
  token: string;
}) {
  const email = invitation.invitee_email;
  const invitePath = `/guardian/invite/${token}`;
  const { profile, error: lookupError } = await findProfileByEmail(admin, email);

  if (lookupError) {
    return { error: { message: lookupError }, recipientType: "unknown" as const };
  }

  const confirmationPath = profile
    ? `/guardian/invite/pending/${invitation.id}`
    : invitePath;
  const emailRedirectTo = `${siteUrl()}/auth/callback?next=${encodeURIComponent(confirmationPath)}`;

  if (profile) {
    const linkedPartyUpdate =
      invitation.direction === "child_invites_guardian"
        ? { guardian_user_id: profile.id }
        : { child_user_id: profile.id };
    const { error: updateError } = await admin
      .from("family_invitations")
      .update(linkedPartyUpdate)
      .eq("id", invitation.id)
      .eq("status", "pending");
    if (updateError) {
      return {
        error: { message: "초대 대상 회원 정보를 저장하지 못했습니다." },
        recipientType: "existing" as const,
      };
    }

    const { error } = await admin.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo },
    });
    return { error, recipientType: "existing" as const };
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: emailRedirectTo,
    data: {
      display_name:
        invitation.direction === "guardian_invites_child"
          ? invitation.child_name
          : null,
      date_of_birth:
        invitation.direction === "guardian_invites_child"
          ? invitation.child_date_of_birth
          : null,
      country_code: "KR",
      family_invitation_id: invitation.id,
    },
  });

  if (!error && data.user) {
    const linkedPartyUpdate =
      invitation.direction === "child_invites_guardian"
        ? { guardian_user_id: data.user.id }
        : { child_user_id: data.user.id };
    await admin
      .from("family_invitations")
      .update(linkedPartyUpdate)
      .eq("id", invitation.id)
      .eq("status", "pending");
  }

  return { error, recipientType: "new" as const };
}

export async function createFamilyInvitation(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const direction = String(formData.get("direction") ?? "") as InvitationDirection;
  const channel = String(formData.get("channel") ?? "email");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const relationship = String(formData.get("relationship") ?? "parent");
  const childName = String(formData.get("childName") ?? "").trim();
  const childDateOfBirth = String(formData.get("childDateOfBirth") ?? "");
  const verifiedTarget = String(formData.get("verifiedTarget") ?? "");

  if (!["child_invites_guardian", "guardian_invites_child"].includes(direction)) {
    redirect("/settings?error=" + encodeURIComponent("올바른 초대 유형을 선택해 주세요."));
  }
  if (channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect("/settings?error=" + encodeURIComponent("초대할 이메일을 확인해 주세요."));
  }
  if (channel === "sms" && !/^\+?\d{9,15}$/.test(phone)) {
    redirect("/settings?error=" + encodeURIComponent("국가번호를 포함한 휴대전화 번호를 입력해 주세요."));
  }
  if (email && user.email?.trim().toLowerCase() === email) {
    redirect(
      "/settings?error=" +
        encodeURIComponent("본인 이메일은 보호자 또는 자녀 초대 이메일로 사용할 수 없습니다."),
    );
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
  const { profile: inviteeProfile, error: lookupError } =
    channel === "email"
      ? await findProfileByEmail(admin, email)
      : { profile: null, error: null };
  if (lookupError) {
    redirect("/settings?error=" + encodeURIComponent(lookupError));
  }
  if (
    channel === "email"
    && (
      (inviteeProfile && verifiedTarget !== inviteeProfile.id)
      || (!inviteeProfile && verifiedTarget !== "new")
    )
  ) {
    redirect(
      "/settings?error="
        + encodeURIComponent("이메일 회원 정보를 다시 조회하고 대상이 맞는지 확인해 주세요."),
    );
  }

  if (
    direction === "child_invites_guardian" &&
    inviteeProfile?.guardian_required
  ) {
    redirect(
      "/settings?error=" +
        encodeURIComponent("미성년 학습자 계정은 보호자 계정으로 연결할 수 없습니다."),
    );
  }
  if (
    direction === "guardian_invites_child" &&
    inviteeProfile &&
    !inviteeProfile.guardian_required
  ) {
    redirect(
      "/settings?error=" +
        encodeURIComponent("기존 회원이 미성년 학습자 계정으로 등록되어 있지 않습니다."),
    );
  }

  if (inviteeProfile) {
    const childUserId =
      direction === "child_invites_guardian" ? user.id : inviteeProfile.id;
    const guardianUserId =
      direction === "child_invites_guardian" ? inviteeProfile.id : user.id;
    const { data: existingLink } = await admin
      .from("guardian_links")
      .select("id, status")
      .eq("child_user_id", childUserId)
      .eq("guardian_user_id", guardianUserId)
      .in("status", ["pending", "active"])
      .maybeSingle();
    if (existingLink) {
      redirect(
        "/settings?error=" +
          encodeURIComponent(
            existingLink.status === "active"
              ? "이미 연결된 보호자와 자녀 계정입니다."
              : "이미 연결 승인을 기다리고 있는 계정입니다.",
          ),
      );
    }
  }

  if (channel === "email") {
    const { data: pendingInvitation } = await admin
      .from("family_invitations")
      .select("id")
      .eq("inviter_user_id", user.id)
      .eq("direction", direction)
      .eq("invitee_email", email)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (pendingInvitation) {
      redirect(
        "/settings?error=" +
          encodeURIComponent("같은 이메일로 발송한 초대가 아직 처리 중입니다."),
      );
    }
  }

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
    .select("id, direction, invitee_email, child_name, child_date_of_birth")
    .single();
  if (error || !createdInvitation) {
    redirect("/settings?error=" + encodeURIComponent("초대를 만들지 못했습니다. DB 마이그레이션 적용 상태를 확인해 주세요."));
  }

  const invitePath = `/guardian/invite/${token}`;
  const inviteUrl = `${siteUrl()}${invitePath}`;

  let deliveryError: { code?: string; message: string } | null = null;
  let recipientType: "existing" | "new" | "unknown" = "unknown";
  if (channel === "email") {
    const delivery = await sendInvitationByAccountStatus({
      admin,
      invitation: createdInvitation as InvitationRecord,
      token,
    });
    deliveryError = delivery.error;
    recipientType = delivery.recipientType;
  }

  const params = new URLSearchParams({
    invite: inviteUrl,
    channel,
    contact: channel === "email" ? email : phone,
  });
  if (deliveryError) {
    params.set(
      "error",
      deliveryError.code === "over_email_send_rate_limit"
        ? "이메일 발송 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요."
        : deliveryError.message.includes("회원")
          ? deliveryError.message
          : "초대 이메일을 보내지 못했습니다. 링크를 복사하거나 잠시 후 다시 시도해 주세요.",
    );
  } else {
    params.set(
      "success",
      recipientType === "existing"
        ? `${email}의 가입 정보를 확인했습니다. 이메일 동의 링크를 발송했습니다.`
        : `${email}은 미가입 이메일입니다. 회원가입이 포함된 초대 링크를 발송했습니다.`,
    );
  }
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
    .select("id, direction, invitee_email, child_name, child_date_of_birth")
    .eq("token_hash", tokenHash)
    .eq("inviter_user_id", user.id)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!invitation || invitation.invitee_email !== email) {
    redirect("/settings?error=" + encodeURIComponent("초대 정보가 만료되었거나 일치하지 않습니다."));
  }

  const delivery = await sendInvitationByAccountStatus({
    admin,
    invitation: invitation as InvitationRecord,
    token,
  });
  const sendError = delivery.error;

  const params = new URLSearchParams({
    invite: inviteUrl,
    channel: "email",
    contact: email,
  });
  if (sendError) {
    params.set(
      "error",
      ("code" in sendError ? sendError.code : undefined) ===
        "over_email_send_rate_limit"
        ? "이메일 발송 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요."
        : "초대 이메일을 보내지 못했습니다. Supabase 이메일 설정을 확인해 주세요.",
    );
  } else {
    params.set(
      "success",
      delivery.recipientType === "existing"
        ? `${email}의 가입 정보를 확인했습니다. 이메일 동의 링크를 다시 발송했습니다.`
        : `${email}로 회원가입이 포함된 초대 링크를 다시 발송했습니다.`,
    );
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
