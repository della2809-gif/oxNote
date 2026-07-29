"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { acceptFamilyInvitationForUser } from "@/lib/family-invitations";

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

  const acceptedAt = new Date().toISOString();
  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({
      terms_accepted_at: acceptedAt,
      privacy_accepted_at: acceptedAt,
      terms_version: "2026-07-28",
      privacy_version: "2026-07-28",
    })
    .eq("id", user.id);
  const result = await acceptFamilyInvitationForUser({
    token,
    userId: user.id,
    userEmail: user.email,
  });
  if (!result.ok) {
    redirect(`/guardian/invite/${encodeURIComponent(token)}?error=${encodeURIComponent(result.error)}`);
  }

  redirect("/settings?success=" + encodeURIComponent("보호자와 자녀 계정 연결이 완료되었습니다."));
}
