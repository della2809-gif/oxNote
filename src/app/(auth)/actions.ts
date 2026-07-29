"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function authErrorMessage(code?: string) {
  if (code === "invalid_credentials") {
    return "이메일 또는 비밀번호가 올바르지 않습니다. 기존 계정이라면 비밀번호를 재설정해 주세요.";
  }
  if (code === "email_not_confirmed") {
    return "이메일 인증이 아직 완료되지 않았습니다. 받은편지함의 인증 메일을 확인해 주세요.";
  }
  if (code === "over_request_rate_limit") {
    return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (
    code === "session_not_found"
    || code === "refresh_token_not_found"
    || code === "refresh_token_already_used"
  ) {
    return "재설정 링크가 만료되었거나 이미 사용되었습니다. 새 메일을 요청해 주세요.";
  }
  if (code === "weak_password") {
    return "보안을 위해 더 강한 비밀번호를 입력해 주세요.";
  }
  if (code === "same_password") {
    return "기존 비밀번호와 다른 새 비밀번호를 입력해 주세요.";
  }
  return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function publicSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return new URL(configured).origin;

  const vercelUrl = process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;

  return "http://localhost:3000";
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(authErrorMessage(error.code))}`);
  }

  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const birthYear = String(formData.get("birthYear") ?? "").trim();
  const birthMonth = String(formData.get("birthMonth") ?? "").trim().padStart(2, "0");
  const birthDay = String(formData.get("birthDay") ?? "").trim().padStart(2, "0");
  const dateOfBirth = `${birthYear}-${birthMonth}-${birthDay}`;
  const countryCode = String(formData.get("countryCode") ?? "KR").toUpperCase();
  const agreedToTerms = formData.get("agreeTerms") === "on";
  const agreedToPrivacy = formData.get("agreePrivacy") === "on";

  if (!agreedToTerms || !agreedToPrivacy) {
    redirect(`/signup?error=${encodeURIComponent("이용약관과 개인정보 처리방침에 동의해 주세요.")}`);
  }

  const parsedBirthDate = new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)
    || Number.isNaN(parsedBirthDate.getTime())
    || parsedBirthDate.getUTCFullYear() !== Number(birthYear)
    || parsedBirthDate.getUTCMonth() + 1 !== Number(birthMonth)
    || parsedBirthDate.getUTCDate() !== Number(birthDay)
    || parsedBirthDate > new Date()
  ) {
    redirect(`/signup?error=${encodeURIComponent("올바른 생년월일을 입력해 주세요.")}`);
  }
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    redirect(`/signup?error=${encodeURIComponent("올바른 거주 국가를 선택해 주세요.")}`);
  }

  const acceptedAt = new Date().toISOString();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${publicSiteUrl()}/auth/callback?next=/dashboard`,
      data: {
        display_name: displayName,
        date_of_birth: dateOfBirth,
        country_code: countryCode,
        terms_accepted_at: acceptedAt,
        privacy_accepted_at: acceptedAt,
        terms_version: "2026-07-28",
        privacy_version: "2026-07-28",
      },
    },
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(authErrorMessage(error.code))}`);
  }

  if (data.user && data.user.identities?.length === 0) {
    redirect(
      `/login?error=${encodeURIComponent("이미 가입된 이메일입니다. 기존 비밀번호로 로그인하거나 비밀번호를 재설정해 주세요.")}`,
    );
  }

  if (!data.session) {
    redirect(
      `/login?message=${encodeURIComponent("회원가입 확인 메일을 보냈습니다. 이메일 인증 후 로그인해 주세요.")}`,
    );
  }

  redirect("/dashboard");
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${publicSiteUrl()}/auth/callback?next=/update-password`,
  });

  if (error) {
    redirect(`/forgot-password?error=${encodeURIComponent(authErrorMessage(error.code))}`);
  }

  redirect(
    `/forgot-password?message=${encodeURIComponent("비밀번호 재설정 메일을 보냈습니다. 받은편지함과 스팸함을 확인해 주세요.")}`,
  );
}

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  if (password.length < 8) {
    redirect(`/update-password?error=${encodeURIComponent("비밀번호는 8자 이상 입력해 주세요.")}`);
  }
  if (password !== passwordConfirm) {
    redirect(`/update-password?error=${encodeURIComponent("비밀번호가 서로 일치하지 않습니다.")}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/update-password?error=${encodeURIComponent("재설정 인증이 확인되지 않았습니다. 비밀번호 재설정 메일을 다시 요청해 주세요.")}`,
    );
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(`/update-password?error=${encodeURIComponent(authErrorMessage(error.code))}`);
  }

  await supabase.auth.signOut();
  redirect(
    `/login?message=${encodeURIComponent("비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.")}`,
  );
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
