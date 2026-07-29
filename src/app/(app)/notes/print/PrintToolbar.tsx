"use client";

export default function PrintToolbar({ count }: { count: number }) {
  return (
    <div className="print-toolbar sticky top-0 z-20 mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
      <div>
        <p className="font-bold text-slate-900">선택한 오답 {count}개</p>
        <p className="mt-1 text-xs text-slate-500">
          인쇄 창에서 프린터 또는 ‘PDF로 저장’을 선택하세요.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => window.close()}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600"
        >
          닫기
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white"
        >
          인쇄 · PDF 저장
        </button>
      </div>
    </div>
  );
}
