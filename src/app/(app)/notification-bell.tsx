import Link from "next/link";

export type HeaderNotification = {
  id: string;
  category: "복습" | "결제" | "보호자 연결";
  title: string;
  description: string;
  href: string;
  actionable?: boolean;
  tone?: "indigo" | "amber" | "red" | "emerald";
};

const toneClasses = {
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
};

export function NotificationBell({ notifications }: { notifications: HeaderNotification[] }) {
  const actionableCount = notifications.filter((notification) => notification.actionable).length;

  return (
    <details className="group relative">
      <summary
        aria-label={`알림 열기${actionableCount > 0 ? `, 확인할 알림 ${actionableCount}개` : ""}`}
        className="relative flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border border-transparent text-slate-700 transition hover:border-slate-200 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-neutral-200 dark:hover:border-neutral-700 dark:hover:bg-neutral-900 [&::-webkit-details-marker]:hidden"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current" strokeWidth="1.7">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" />
          <path strokeLinecap="round" d="M10 21h4" />
        </svg>
        {actionableCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-white dark:ring-neutral-950">
            {actionableCount > 9 ? "9+" : actionableCount}
          </span>
        )}
      </summary>

      <div className="absolute right-0 z-50 mt-3 w-[min(23rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-neutral-800">
          <div>
            <h2 className="font-semibold text-slate-950 dark:text-white">알림</h2>
            <p className="mt-0.5 text-xs text-slate-500">복습·결제·보호자 연결 정보</p>
          </div>
          {actionableCount > 0 && (
            <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 dark:bg-red-950/50 dark:text-red-300">
              확인 필요 {actionableCount}
            </span>
          )}
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-2">
          {notifications.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-neutral-900">
                ✓
              </div>
              <p className="mt-3 text-sm font-semibold">새로 확인할 알림이 없습니다.</p>
              <p className="mt-1 text-xs text-slate-500">복습이나 계정 상태가 바뀌면 여기에 표시됩니다.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {notifications.map((notification) => (
                <Link
                  key={notification.id}
                  href={notification.href}
                  className="block rounded-xl px-3 py-3 transition hover:bg-slate-50 dark:hover:bg-neutral-900"
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${toneClasses[notification.tone ?? "indigo"]}`}>
                      {notification.category}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <strong className="text-sm text-slate-950 dark:text-white">{notification.title}</strong>
                        {notification.actionable && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-neutral-400">
                        {notification.description}
                      </span>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
