"use client";

import { useFormStatus } from "react-dom";

export function RemoveChildConnectionButton({ childName }: { childName: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (
          !window.confirm(
            `${childName} 학습자와의 연결을 삭제할까요? 삭제하면 자녀 계정에서도 연결 정보가 사라집니다.`,
          )
        ) {
          event.preventDefault();
        }
      }}
      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
    >
      {pending ? "삭제 중..." : "자녀 연결 삭제"}
    </button>
  );
}
