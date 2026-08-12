"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type SectionKey = "source" | "analysis" | "steps" | "review" | "reason";
type LayoutKey = "standard" | "worksheet" | "answer";

const LAYOUT_OPTIONS: Array<{ key: LayoutKey; label: string; description: string }> = [
  { key: "standard", label: "기본형", description: "보관형 오답노트에 적합합니다." },
  { key: "worksheet", label: "문제지형", description: "문제만 연속 출력되고, 분석 및 정답은 뒤쪽 해설 페이지로 분리되어 있습니다." },
  { key: "answer", label: "해설지형", description: "문제 분석 및 단계별 풀이를 위주로 배치하며 문제의 개념과 풀이 복습에 적합합니다." },
];

const SECTION_OPTIONS: Array<{ key: SectionKey; label: string; description: string }> = [
  { key: "source", label: "문제 원본", description: "사진 또는 인식된 문제" },
  { key: "analysis", label: "문제 분석", description: "핵심 개념과 정답" },
  { key: "steps", label: "단계별 풀이", description: "순서대로 정리한 풀이" },
  { key: "review", label: "다시 확인할 지점", description: "헷갈리기 쉬운 부분" },
  { key: "reason", label: "내가 틀린 이유", description: "직접 작성한 오답 원인" },
];

const PRESETS: Array<{ label: string; sections: SectionKey[] }> = [
  { label: "간단 오답노트", sections: ["source", "reason"] },
  { label: "풀이 학습지", sections: ["source", "steps", "review"] },
  { label: "전체 해설", sections: ["source", "analysis", "steps", "review", "reason"] },
];

const STEPS = [
  ["문장 구조 확인", "각 선택지에서 조동사와 일반동사의 결합 구조를 먼저 확인합니다."],
  ["need의 쓰임 구분", "need가 조동사라면 뒤에 동사원형이, 일반동사라면 문장 구조에 맞는 형태가 옵니다."],
  ["선택지 비교", "문법적으로 자연스럽고 문맥에도 맞는 ④번을 정답으로 고릅니다."],
];

export default function PrintOptionsPreview() {
  const [sections, setSections] = useState<SectionKey[]>(["source", "steps", "reason"]);
  const [layout, setLayout] = useState<LayoutKey>("standard");
  const [openLayoutHelp, setOpenLayoutHelp] = useState<LayoutKey | null>(null);
  const selected = useMemo(() => new Set(sections), [sections]);

  function toggleSection(key: SectionKey) {
    setSections((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-7">
          <div>
            <strong className="text-xl tracking-tight">xonote</strong>
            <span className="ml-3 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">로그인 없는 기능 미리보기</span>
          </div>
          <Link href="/preview/notes" className="text-sm font-bold text-indigo-600">오답노트 미리보기 →</Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-7 lg:grid-cols-[340px_minmax(0,1fr)] lg:px-7">
        <aside className="h-fit space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6">
          <div>
            <p className="text-xs font-bold text-indigo-600">인쇄 설정</p>
            <h1 className="mt-1 text-2xl font-bold">원하는 내용만 선택하세요</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">선택한 항목만 아래 A4 미리보기에 표시됩니다.</p>
          </div>

          <section>
            <h2 className="text-sm font-bold">빠른 구성</h2>
            <div className="mt-3 grid gap-2">
              {PRESETS.map((preset) => {
                const active = preset.sections.length === sections.length && preset.sections.every((item) => selected.has(item));
                return (
                  <button key={preset.label} type="button" onClick={() => setSections(preset.sections)} className={`min-h-11 rounded-xl border px-4 py-3 text-left text-sm font-bold transition ${active ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-200 hover:border-indigo-300"}`}>
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="border-t border-slate-100 pt-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">인쇄할 내용</h2>
              <span className="text-xs text-slate-400">{sections.length}/5 선택</span>
            </div>
            <div className="mt-3 space-y-2">
              {SECTION_OPTIONS.map((option) => (
                <label key={option.key} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${selected.has(option.key) ? "border-indigo-300 bg-indigo-50/70" : "border-slate-200"}`}>
                  <input type="checkbox" checked={selected.has(option.key)} onChange={() => toggleSection(option.key)} className="h-5 w-5 accent-indigo-600" />
                  <span>
                    <strong className="block text-sm">{option.label}</strong>
                    <span className="text-xs text-slate-400">{option.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="border-t border-slate-100 pt-5">
            <h2 className="text-sm font-bold">레이아웃</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {LAYOUT_OPTIONS.map((option) => (
                <div key={option.key} className="relative">
                  <button type="button" onClick={() => setLayout(option.key)} className={`min-h-11 w-full rounded-xl border px-2 pr-7 text-xs font-bold ${layout === option.key ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 text-slate-600"}`}>
                    {option.label}
                  </button>
                  <button
                    type="button"
                    aria-label={`${option.label} 설명 보기`}
                    aria-expanded={openLayoutHelp === option.key}
                    onClick={() => setOpenLayoutHelp((current) => current === option.key ? null : option.key)}
                    className={`absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full border text-[11px] font-black ${layout === option.key ? "border-white/50 bg-white/15 text-white" : "border-slate-300 bg-white text-slate-500"}`}
                  >
                    ?
                  </button>
                </div>
              ))}
            </div>
            {openLayoutHelp && (
              <div role="dialog" aria-label={`${LAYOUT_OPTIONS.find((item) => item.key === openLayoutHelp)?.label} 설명`} className="relative mt-3 rounded-xl border border-indigo-200 bg-white p-4 pr-10 shadow-lg shadow-slate-200/70">
                <button type="button" aria-label="설명 닫기" onClick={() => setOpenLayoutHelp(null)} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg text-lg text-slate-500 hover:bg-slate-100">×</button>
                <p className="text-xs font-bold text-indigo-600">{LAYOUT_OPTIONS.find((item) => item.key === openLayoutHelp)?.label}</p>
                <p className="mt-2 text-xs leading-5 text-slate-600">{LAYOUT_OPTIONS.find((item) => item.key === openLayoutHelp)?.description}</p>
                <div className="mt-3 flex items-center gap-1.5" aria-hidden="true">
                  {LAYOUT_OPTIONS.map((item) => <span key={item.key} className={`h-1.5 flex-1 rounded-full ${item.key === openLayoutHelp ? "bg-indigo-500" : "bg-slate-200"}`} />)}
                </div>
              </div>
            )}
          </section>

          <button type="button" onClick={() => window.print()} disabled={sections.length === 0} className="min-h-12 w-full rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-100 disabled:bg-slate-300">
            인쇄 · PDF 저장
          </button>
        </aside>

        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
            <div>
              <h2 className="font-bold">선택한 오답 1개</h2>
              <p className="mt-1 text-xs text-slate-500">예상 1페이지 · A4 세로 · {layout === "standard" ? "기본형" : layout === "worksheet" ? "문제지형" : "해설지형"}</p>
            </div>
            <p className="text-xs font-semibold text-indigo-600">설정을 바꾸면 미리보기가 바로 갱신됩니다</p>
          </div>

          <article className="mx-auto min-h-[297mm] max-w-[210mm] bg-white p-[10mm] shadow-xl print:min-h-0 print:max-w-none print:p-0 print:shadow-none">
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-600">XONOTE · 선택 인쇄</p>
                <h2 className="mt-2 text-xl font-bold leading-tight">lest, need, necessary that, may well의 어법 비교하기</h2>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-600">공무원시험</span>
                  <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-600">4지선다형 어법</span>
                </div>
              </div>
              <span className="text-xs text-slate-400">1 / 1</span>
            </header>

            {sections.length === 0 && <div className="mt-8 rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center text-sm text-slate-400">왼쪽에서 인쇄할 내용을 선택해 주세요.</div>}

            <div className={`mt-4 grid gap-4 ${selected.has("source") && selected.has("analysis") && layout === "standard" ? "md:grid-cols-2" : "grid-cols-1"}`}>
              {selected.has("source") && (
                <PreviewBox title="문제 원본" color="text-indigo-600">
                  <div className="mt-3 rounded-xl bg-slate-50 p-5 text-[12px] leading-7 text-slate-800">
                    <strong>12번. 다음 중 어법상 올바른 문장은?</strong>
                    <ol className="mt-3 list-decimal space-y-1 pl-5">
                      <li>I studied hard lest I should not fail in the examination.</li>
                      <li>It needs hardly be said that health is above wealth.</li>
                      <li>It is necessary that you will realize the truth.</li>
                      <li>You may well be proud of your wife.</li>
                    </ol>
                  </div>
                </PreviewBox>
              )}

              {selected.has("analysis") && (
                <PreviewBox title="문제 분석" color="text-emerald-600">
                  <p className="mt-3 text-[12px] font-semibold leading-6">조동사와 일반동사의 형태, 당위적 가정법, 관용 표현을 함께 구분하는 문제입니다.</p>
                  <dl className="mt-3 space-y-2 rounded-xl bg-slate-50 p-4 text-[11px]">
                    <div><dt className="font-bold text-slate-400">핵심 개념</dt><dd className="mt-1">lest 구문 · 조동사 need · necessary that · may well</dd></div>
                    <div><dt className="font-bold text-slate-400">정답</dt><dd className="mt-1 font-bold text-emerald-600">④ You may well be proud of your wife.</dd></div>
                  </dl>
                </PreviewBox>
              )}
            </div>

            {selected.has("steps") && (
              <section className="mt-4 rounded-2xl border border-slate-200 p-5">
                <div className="flex items-center justify-between gap-3"><h3 className="text-xs font-bold text-indigo-600">단계별 풀이</h3><span className="text-[10px] font-bold text-emerald-600">정답 ④</span></div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {STEPS.map(([title, body], index) => (
                    <div key={title} className="border-t border-slate-100 pt-3 text-[11px] leading-5">
                      <span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-lg bg-indigo-50 font-bold text-indigo-600">{index + 1}</span>
                      <strong>{title}</strong><p className="mt-2 text-slate-600">{body}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {(selected.has("review") || selected.has("reason")) && (
              <div className={`mt-4 grid gap-4 ${selected.has("review") && selected.has("reason") ? "sm:grid-cols-2" : "grid-cols-1"}`}>
                {selected.has("review") && (
                  <PreviewBox title="다시 확인할 지점" color="text-amber-600">
                    <ol className="mt-3 space-y-2 text-[11px] leading-5 text-slate-600">
                      <li><strong className="text-slate-800">1. lest 뒤의 not</strong> — lest 자체에 부정 의미가 있으므로 중복 부정을 주의합니다.</li>
                      <li><strong className="text-slate-800">2. need의 품사</strong> — 조동사와 일반동사의 뒤 구조가 다릅니다.</li>
                      <li><strong className="text-slate-800">3. necessary that</strong> — 당위 표현 뒤 동사 형태를 확인합니다.</li>
                    </ol>
                  </PreviewBox>
                )}
                {selected.has("reason") && (
                  <PreviewBox title="내가 틀린 이유" color="text-rose-600">
                    <div className="mt-3 min-h-24 rounded-xl bg-rose-50/60 p-4 text-[11px] leading-6 text-slate-700">need를 항상 일반동사로 생각해서 2번 문장의 구조를 잘못 판단했다. 다음에는 need 뒤 동사 형태를 먼저 확인한다.</div>
                  </PreviewBox>
                )}
              </div>
            )}
          </article>
        </section>
      </div>
    </main>
  );
}

function PreviewBox({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 p-5"><h3 className={`text-xs font-bold ${color}`}>{title}</h3>{children}</section>;
}
