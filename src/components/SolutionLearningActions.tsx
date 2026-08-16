"use client";

import { useState } from "react";
import MathText from "@/components/MathText";
import type { NoteAiDetails } from "@/lib/types";

type PracticeProblem = {
  question: string;
  hint: string;
  answer: string;
  solution: string;
};

export default function SolutionLearningActions({
  noteId,
  alternativeSolution,
  previewPractice,
  isMath = false,
}: {
  noteId: string;
  alternativeSolution?: NoteAiDetails["alternativeSolution"];
  previewPractice?: PracticeProblem;
  isMath?: boolean;
}) {
  const [showAlternative, setShowAlternative] = useState(false);
  const [practice, setPractice] = useState<PracticeProblem | null>(null);
  const [showPracticeAnswer, setShowPracticeAnswer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [variant, setVariant] = useState(0);
  const hasAlternative = Boolean(alternativeSolution?.available && alternativeSolution.steps.length > 0);

  async function createPracticeProblem(makeAnother = false) {
    if (practice && !makeAnother) {
      document.getElementById("similar-practice")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (previewPractice) {
      setPractice(previewPractice);
      setShowPracticeAnswer(false);
      requestAnimationFrame(() => document.getElementById("similar-practice")?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const nextVariant = makeAnother ? variant + 1 : variant;
      const response = await fetch(`/api/notes/${noteId}/similar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant: nextVariant }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "비슷한 문제를 만들지 못했습니다.");
      setPractice(body.practice);
      setVariant(nextVariant);
      setShowPracticeAnswer(false);
      requestAnimationFrame(() => document.getElementById("similar-practice")?.scrollIntoView({ behavior: "smooth", block: "center" }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "비슷한 문제를 만들지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  if (!hasAlternative && !isMath) return null;

  return (
    <div className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm sm:p-5">
      <div className={`grid gap-3 ${hasAlternative && isMath ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}>
        {hasAlternative && (
          <button
            type="button"
            onClick={() => setShowAlternative((current) => !current)}
            aria-expanded={showAlternative}
            className="min-h-12 rounded-xl border border-indigo-200 px-5 py-3 text-sm font-bold text-indigo-700 transition hover:bg-indigo-50"
          >
            {showAlternative ? "다른 풀이 닫기" : "다른 풀이 보기"}
          </button>
        )}
        {isMath && (
          <button
            type="button"
            onClick={() => createPracticeProblem(false)}
            disabled={loading}
            className="min-h-12 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-wait disabled:bg-indigo-300"
          >
            {loading ? "비슷한 문제 만드는 중…" : "비슷한 문제 풀기"}
          </button>
        )}
      </div>

      {showAlternative && hasAlternative && (
        <section className="mt-4 rounded-2xl bg-indigo-50 p-4 sm:p-5">
          <p className="text-xs font-bold text-indigo-600">다른 접근</p>
          <h3 className="mt-1 text-lg font-bold text-slate-900">{alternativeSolution?.title}</h3>
          {alternativeSolution?.explanation && <p className="mt-2 text-sm leading-6 text-slate-600"><MathText>{alternativeSolution.explanation}</MathText></p>}
          <div className="mt-4 space-y-3">
            {alternativeSolution?.steps.map((step, index) => (
              <div key={`${step.title}-${index}`} className="grid grid-cols-[28px_1fr] gap-3 rounded-xl bg-white p-4">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-600 text-xs font-bold text-white">{index + 1}</span>
                <div>
                  <p className="text-sm font-bold text-slate-800">{step.title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600"><MathText>{step.explanation}</MathText></p>
                  {step.formula && <p className="mt-2 overflow-x-auto rounded-lg bg-slate-50 px-3 py-2 text-sm"><MathText>{step.formula}</MathText></p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>}

      {practice && (
        <section id="similar-practice" className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 sm:p-5">
          <p className="text-xs font-bold text-indigo-600">같은 개념 · 비슷한 난이도</p>
          <h3 className="mt-2 text-lg font-bold text-slate-900">비슷한 문제</h3>
          <div className="mt-3 whitespace-pre-wrap rounded-xl bg-white p-4 text-sm font-semibold leading-7 text-slate-800"><MathText>{practice.question}</MathText></div>
          <details className="mt-3 rounded-xl border border-indigo-100 bg-white px-4 py-3">
            <summary className="cursor-pointer text-sm font-bold text-indigo-600">힌트 보기</summary>
            <p className="mt-2 text-sm leading-6 text-slate-600"><MathText>{practice.hint}</MathText></p>
          </details>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowPracticeAnswer((current) => !current)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700"
            >
              {showPracticeAnswer ? "정답·풀이 닫기" : "정답·풀이 확인"}
            </button>
            <button
              type="button"
              onClick={() => createPracticeProblem(true)}
              disabled={loading}
              className="rounded-xl border border-indigo-200 bg-white px-4 py-3 text-sm font-bold text-indigo-600 disabled:cursor-wait disabled:text-indigo-300"
            >
              {loading ? "검증 중…" : "다른 문제 만들기"}
            </button>
          </div>
          {showPracticeAnswer && (
            <div className="mt-3 rounded-xl bg-white p-4 text-sm leading-7 text-slate-700">
              <p className="font-bold text-emerald-700">정답 · <MathText>{practice.answer}</MathText></p>
              <p className="mt-2 whitespace-pre-wrap"><MathText>{practice.solution}</MathText></p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
