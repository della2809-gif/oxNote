"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  const displayName = String(formData.get("displayName") ?? "");
  const dateOfBirth = String(formData.get("dateOfBirth") ?? "");
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
    || parsedBirthDate > new Date()
  ) {
    redirect(`/signup?error=${encodeURIComponent("올바른 생년월일을 입력해 주세요.")}`);
  }
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    redirect(`/signup?error=${encodeURIComponent("올바른 거주 국가를 선택해 주세요.")}`);
  }

  const acceptedAt = new Date().toISOString();

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
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
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
