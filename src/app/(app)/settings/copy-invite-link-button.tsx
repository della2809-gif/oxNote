"use client";

import { useState } from "react";

export function CopyInviteLinkButton({ inviteUrl }: { inviteUrl: string }) {
  const [copied, setCopied] = useState(false);

  async function copyInviteUrl() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      window.prompt("아래 초대 링크를 복사해 주세요.", inviteUrl);
    }
  }

  return (
    <button
      type="button"
      onClick={copyInviteUrl}
      className="rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-neutral-950 dark:text-indigo-200 dark:hover:bg-indigo-950"
    >
      {copied ? "복사했습니다" : "공유링크 복사하기"}
    </button>
  );
}
