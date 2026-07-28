"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function recoveryErrorMessage(code?: string) {
  if (code === "weak_password") {
    return "보안을 위해 더 강한 비밀번호를 입력해 주세요.";
  }
  if (code === "same_password") {
    return "기존 비밀번호와 다른 새 비밀번호를 입력해 주세요.";
  }
  if (
    code === "session_not_found"
    || code === "refresh_token_not_found"
    || code === "refresh_token_already_used"
  ) {
    return "재설정 링크가 만료되었거나 이미 사용되었습니다. 비밀번호 재설정 메일을 다시 요청해 주세요.";
  }
  return "비밀번호를 변경하지 못했습니다. 새 재설정 메일을 받은 뒤 다시 시도해 주세요.";
}

export default function RecoveryPasswordForm({
  initialError,
}: {
  initialError?: string;
}) {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(initialError ?? "");

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    async function prepareRecoverySession() {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.slice(1));
      const linkError = url.searchParams.get("error_description")
        ?? hash.get("error_description");

      if (linkError) {
        if (isMounted) {
          setError("재설정 링크가 만료되었거나 올바르지 않습니다. 새 메일을 요청해 주세요.");
        }
        return;
      }

      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          if (isMounted) setError(recoveryErrorMessage(sessionError.code));
          return;
        }

        window.history.replaceState(
          {},
          document.title,
          `${url.pathname}${url.search}`,
        );
      }

      const code = url.searchParams.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          if (isMounted) setError(recoveryErrorMessage(exchangeError.code));
          return;
        }

        url.searchParams.delete("code");
        window.history.replaceState(
          {},
          document.title,
          `${url.pathname}${url.search}`,
        );
      }

      const { data, error: userError } = await supabase.auth.getUser();
      if (!data.user || userError) {
        if (isMounted) {
          setError("재설정 인증이 확인되지 않았습니다. 비밀번호 재설정 메일을 다시 요청해 주세요.");
        }
        return;
      }

      if (isMounted) {
        setError("");
        setIsReady(true);
      }
    }

    void prepareRecoverySession();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

    if (password.length < 8) {
      setError("비밀번호는 8자 이상 입력해 주세요.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호가 서로 일치하지 않습니다.");
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(recoveryErrorMessage(updateError.code));
      setIsSubmitting(false);
      return;
    }

    await supabase.auth.signOut();
    router.replace(
      `/login?message=${encodeURIComponent("비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.")}`,
    );
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-neutral-200 p-6 dark:border-neutral-800"
    >
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">새 비밀번호 설정</h1>
        <p className="text-sm text-neutral-500">
          새로 사용할 비밀번호를 입력해 주세요.
        </p>
      </div>

      {!isReady && !error && (
        <p className="rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
          재설정 링크를 확인하고 있습니다.
        </p>
      )}

      {error && (
        <div className="space-y-3 rounded-md bg-red-50 px-3 py-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
          <p>{error}</p>
          {!isReady && (
            <a
              href="/forgot-password"
              className="inline-block font-medium underline underline-offset-2"
            >
              재설정 메일 다시 받기
            </a>
          )}
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium">
          새 비밀번호
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          disabled={!isReady || isSubmitting}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:disabled:bg-neutral-800"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="passwordConfirm" className="text-sm font-medium">
          새 비밀번호 확인
        </label>
        <input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          disabled={!isReady || isSubmitting}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:disabled:bg-neutral-800"
        />
      </div>

      <button
        type="submit"
        disabled={!isReady || isSubmitting}
        className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {isSubmitting ? "변경 중..." : "비밀번호 변경"}
      </button>
    </form>
  );
}
