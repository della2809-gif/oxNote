"use client";

import { useState, useTransition } from "react";
import { lookupFamilyInvitee } from "./actions";

type LookupResult = Awaited<ReturnType<typeof lookupFamilyInvitee>>;

export function InviteEmailVerification({
  type,
  direction,
  submitLabel,
}: {
  type: "guardian" | "child";
  direction: "child_invites_guardian" | "guardian_invites_child";
  submitLabel: string;
}) {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();

  function resetVerification(nextEmail: string) {
    setEmail(nextEmail);
    setResult(null);
    setConfirmed(false);
  }

  function verifyEmail() {
    setConfirmed(false);
    startTransition(async () => {
      setResult(await lookupFamilyInvitee(email, direction));
    });
  }

  const canConfirm = result?.status === "found" || result?.status === "not_found";
  const verifiedTarget = confirmed && canConfirm ? result.verificationKey : "";

  return (
    <div className="space-y-3">
      <input type="hidden" name="channel" value="email" />
      <input type="hidden" name="verifiedTarget" value={verifiedTarget} />
      <label className="block text-sm">
        <span className="font-medium">
          {type === "guardian" ? "보호자 이메일" : "미성년 자녀 이메일"}
        </span>
        <div className="mt-1 flex gap-2">
          <input
            name="email"
            type="email"
            required
            value={email}
            onChange={(event) => resetVerification(event.target.value)}
            placeholder={type === "guardian" ? "guardian@example.com" : "child@example.com"}
            className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="button"
            onClick={verifyEmail}
            disabled={isPending || !email.trim()}
            className="rounded-md border border-neutral-300 px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700"
          >
            {isPending ? "조회 중" : "회원 확인"}
          </button>
        </div>
      </label>

      {result?.status === "error" && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {result.message}
        </p>
      )}

      {canConfirm && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm dark:border-indigo-900 dark:bg-indigo-950/40">
          {result.status === "found" ? (
            <>
              <p className="font-semibold text-indigo-950 dark:text-indigo-100">{result.maskedName} 회원이 맞나요?</p>
              <p className="mt-1 text-xs text-indigo-700 dark:text-indigo-300">
                입력한 이메일과 회원 DB가 일치합니다. 이름을 확인한 뒤 발송해 주세요.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-indigo-950 dark:text-indigo-100">가입된 회원 정보가 없습니다.</p>
              <p className="mt-1 text-xs text-indigo-700 dark:text-indigo-300">
                이 이메일로 회원가입이 포함된 초대 메일을 발송합니다.
              </p>
            </>
          )}
          <button
            type="button"
            onClick={() => setConfirmed(true)}
            disabled={confirmed}
            className="mt-3 rounded-md bg-indigo-600 px-3 py-2 font-semibold text-white disabled:bg-emerald-600"
          >
            {confirmed
              ? "회원 정보 확인 완료"
              : result.status === "found"
                ? "네, 이 회원이 맞습니다"
                : "미가입자 초대 계속하기"}
          </button>
        </div>
      )}

      <button
        type="submit"
        disabled={!confirmed}
        className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300 dark:bg-white dark:text-neutral-900 dark:disabled:bg-neutral-700"
      >
        {submitLabel}
      </button>
      {!confirmed && (
        <p className="text-xs text-neutral-500">이메일의 회원 정보를 조회하고 대상이 맞는지 확인해야 발송할 수 있습니다.</p>
      )}
    </div>
  );
}
