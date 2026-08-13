"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export type PrintSection = "source" | "analysis" | "steps" | "review" | "reason";
export type PrintLayout = "worksheet" | "answer";

export const PRINT_SECTIONS: Array<{ key: PrintSection; label: string; description: string }> = [
  { key: "source", label: "문제 전문", description: "원본에서 추출한 시험 문제" },
  { key: "analysis", label: "문제 분석", description: "핵심 개념과 정답" },
  { key: "steps", label: "단계별 풀이", description: "순서대로 정리한 풀이" },
  { key: "review", label: "다시 확인할 지점", description: "헷갈리기 쉬운 부분" },
  { key: "reason", label: "내가 틀린 이유", description: "직접 작성한 오답 원인" },
];

const LAYOUTS: Array<{ key: PrintLayout; label: string; description: string }> = [
  { key: "worksheet", label: "문제지형", description: "선택한 문제 전문은 앞쪽 시험지에 모으고, 분석·풀이·정답은 새 페이지의 답지로 분리합니다." },
  { key: "answer", label: "해설지형", description: "선택한 모든 내용을 문제별로 묶어 문제와 해설이 연속해서 나오도록 배치합니다." },
];

export default function PrintToolbar({ count, initialSections, initialLayout }: { count: number; initialSections: PrintSection[]; initialLayout: PrintLayout }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sections, setSections] = useState(initialSections);
  const [layout, setLayout] = useState(initialLayout);
  const [openHelp, setOpenHelp] = useState<PrintLayout | null>(null);

  function apply(nextSections: PrintSection[], nextLayout: PrintLayout) {
    setSections(nextSections);
    setLayout(nextLayout);
    const params = new URLSearchParams(searchParams.toString());
    params.set("sections", nextSections.join(","));
    params.set("layout", nextLayout);
    router.replace(`/notes/print?${params.toString()}`, { scroll: false });
  }

  function toggleSection(section: PrintSection) {
    const next = sections.includes(section) ? sections.filter((item) => item !== section) : [...sections, section];
    apply(next, layout);
  }

  return (
    <aside className="print-toolbar mb-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="font-bold text-slate-900">선택한 오답 {count}개</p><p className="mt-1 text-xs text-slate-500">원하는 내용과 출력 형식을 선택하세요.</p></div>
        <div className="flex gap-2">
          <button type="button" onClick={() => window.close()} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600">닫기</button>
          <button type="button" onClick={() => window.print()} disabled={sections.length === 0} className="min-h-11 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white disabled:bg-slate-300">인쇄 · PDF 저장</button>
        </div>
      </div>

      <div className="mt-5 grid gap-6">
        <div className="w-full">
          <p className="text-sm font-bold">레이아웃</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {LAYOUTS.map((option) => (
              <div key={option.key} className="relative">
                <button type="button" onClick={() => apply(sections, option.key)} className={`min-h-11 w-full rounded-xl border px-2 pr-7 text-xs font-bold ${layout === option.key ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 text-slate-600"}`}>{option.label}</button>
                <button type="button" aria-label={`${option.label} 설명 보기`} aria-expanded={openHelp === option.key} onClick={() => setOpenHelp((current) => current === option.key ? null : option.key)} className={`absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full border text-[11px] font-black ${layout === option.key ? "border-white/50 bg-white/15 text-white" : "border-slate-300 bg-white text-slate-500"}`}>?</button>
              </div>
            ))}
          </div>
          {openHelp && (
            <div role="dialog" className="relative mt-2 rounded-xl border border-indigo-200 bg-white p-4 pr-10 shadow-lg">
              <button type="button" aria-label="설명 닫기" onClick={() => setOpenHelp(null)} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg text-lg text-slate-500 hover:bg-slate-100">×</button>
              <p className="text-xs font-bold text-indigo-600">{LAYOUTS.find((item) => item.key === openHelp)?.label}</p>
              <p className="mt-2 text-xs leading-5 text-slate-600">{LAYOUTS.find((item) => item.key === openHelp)?.description}</p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 pt-5">
          <p className="mb-3 text-sm font-bold">인쇄할 내용</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {PRINT_SECTIONS.map((option) => (
              <label key={option.key} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-3 ${sections.includes(option.key) ? "border-indigo-300 bg-indigo-50" : "border-slate-200"}`}>
                <input type="checkbox" checked={sections.includes(option.key)} onChange={() => toggleSection(option.key)} className="h-5 w-5 accent-indigo-600" />
                <span><strong className="block text-sm">{option.label}</strong><span className="text-[11px] text-slate-400">{option.description}</span></span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
