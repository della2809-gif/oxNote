"use client";

import { useState } from "react";
import {
  requestAccountDeletion,
  submitSupportInquiry,
} from "./actions";

type OpenPanel = "support" | "deletion" | null;

export function SupportAndAccountActions({
  deletionRequest,
  initialPanel,
}: {
  deletionRequest: { requestedAt: string; status: string } | null;
  initialPanel: OpenPanel;
}) {
  const [openPanel, setOpenPanel] = useState<OpenPanel>(initialPanel);

  function toggle(panel: Exclude<OpenPanel, null>) {
    setOpenPanel((current) => (current === panel ? null : panel));
  }

  return (
    <div className="mt-4">
      <div className="flex items-center gap-4 text-sm">
        <button
          type="button"
          className="underline underline-offset-2"
          aria-expanded={openPanel === "support"}
          aria-controls="support-inquiry-panel"
          onClick={() => toggle("support")}
        >
          이용문의
        </button>
        <button
          type="button"
          className="underline underline-offset-2"
          aria-expanded={openPanel === "deletion"}
          aria-controls="account-deletion-panel"
          onClick={() => toggle("deletion")}
        >
          계정 삭제
        </button>
      </div>

      {openPanel === "support" && (
        <div
          id="support-inquiry-panel"
          className="mt-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
        >
          <form action={submitSupportInquiry} className="space-y-3">
            <div>
              <h3 className="font-semibold">이용문의 접수</h3>
              <p className="mt-1 text-sm text-neutral-500">
                회원 이름과 이메일이 함께 전달되며, 접수 내용은 운영자 콘솔과 운영자 이메일로 안내됩니다.
              </p>
            </div>
            <label className="block text-sm">
              <span className="font-medium">문의 유형</span>
              <select
                name="category"
                defaultValue="service"
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              >
                <option value="service">서비스 이용</option>
                <option value="account">계정</option>
                <option value="billing">결제·구독</option>
                <option value="technical">오류·기술 지원</option>
                <option value="other">기타</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">제목</span>
              <input
                name="subject"
                required
                minLength={2}
                maxLength={120}
                placeholder="문의 제목을 입력해 주세요."
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">문의 내용</span>
              <textarea
                name="message"
                required
                minLength={10}
                maxLength={5000}
                rows={5}
                placeholder="문의 내용을 자세히 입력해 주세요."
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              />
            </label>
            <button className="rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200">
              문의 접수
            </button>
          </form>
        </div>
      )}

      {openPanel === "deletion" && (
        <div
          id="account-deletion-panel"
          className="mt-4 rounded-xl border border-red-200 p-4 dark:border-red-900"
        >
          {deletionRequest ? (
            <p className="text-sm text-neutral-500">
              {new Date(deletionRequest.requestedAt).toLocaleDateString("ko-KR")}에 요청했으며 현재 상태는{" "}
              <strong>{deletionRequest.status}</strong>입니다.
            </p>
          ) : (
            <form action={requestAccountDeletion} className="space-y-3">
              <p className="text-sm text-neutral-500">
                요청이 접수되면 관리자가 구독과 데이터를 확인한 뒤 삭제를 처리합니다.
              </p>
              <textarea
                name="reason"
                rows={2}
                placeholder="탈퇴 사유 (선택)"
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              />
              <input
                name="confirmation"
                required
                placeholder="'계정 삭제 요청' 입력"
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              />
              <button className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500">
                삭제 요청 접수
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
