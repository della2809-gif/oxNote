"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { deleteSelectedNotes, moveSelectedNotes } from "./actions";

type SubjectOption = {
  id: string;
  name: string;
};

export function BulkNotesForm({
  heading,
  resultCount,
  subjects,
  returnTo,
  children,
}: {
  heading: string;
  resultCount: number;
  subjects: SubjectOption[];
  returnTo: string;
  children: ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedCount, setSelectedCount] = useState(0);

  function countSelected(form: HTMLFormElement | null) {
    setSelectedCount(form?.querySelectorAll<HTMLInputElement>('input[name="ids"]:checked').length ?? 0);
  }

  function handleChange(event: FormEvent<HTMLFormElement>) {
    if (event.target instanceof HTMLInputElement && event.target.name === "ids") {
      countSelected(event.currentTarget);
    }
  }

  function toggleAll() {
    const inputs = formRef.current?.querySelectorAll<HTMLInputElement>('input[name="ids"]');
    if (!inputs) return;
    const shouldSelect = selectedCount !== inputs.length;
    inputs.forEach((input) => {
      input.checked = shouldSelect;
    });
    setSelectedCount(shouldSelect ? inputs.length : 0);
  }

  return (
    <form
      ref={formRef}
      action="/notes/print"
      method="get"
      target="_blank"
      onChange={handleChange}
    >
      <input type="hidden" name="returnTo" value={returnTo} />
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{heading}</h2>
          <p className="mt-1 text-xs text-slate-400">
            {resultCount}개의 오답 · {selectedCount > 0 ? `${selectedCount}개 선택됨` : "항목을 선택해 주세요"}
          </p>
        </div>

        {resultCount > 0 && (
          <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto">
            <button
              type="button"
              onClick={toggleAll}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
            >
              {selectedCount === resultCount ? "전체 해제" : "전체 선택"}
            </button>
            <button
              type="submit"
              disabled={selectedCount === 0 || selectedCount > 20}
              className="rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-bold text-indigo-600 shadow-sm transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              인쇄 · PDF 저장
            </button>
            <select
              name="targetSubjectId"
              defaultValue=""
              aria-label="이동할 과목"
              className="min-w-[150px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700"
            >
              <option value="">이동할 과목</option>
              <option value="__none__">과목 없음</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>{subject.name}</option>
              ))}
            </select>
            <button
              type="submit"
              formAction={moveSelectedNotes}
              formTarget="_self"
              disabled={selectedCount === 0 || selectedCount > 100}
              className="rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-sm font-bold text-amber-700 shadow-sm transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              과목 이동
            </button>
            <button
              type="submit"
              formAction={deleteSelectedNotes}
              formTarget="_self"
              disabled={selectedCount === 0 || selectedCount > 100}
              onClick={(event) => {
                if (!window.confirm(`선택한 오답 ${selectedCount}개를 삭제할까요? 삭제한 내용과 첨부 파일은 복구할 수 없습니다.`)) {
                  event.preventDefault();
                }
              }}
              className="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-bold text-rose-600 shadow-sm transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              삭제
            </button>
          </div>
        )}
      </div>

      {selectedCount > 20 && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          인쇄·PDF 저장은 한 번에 20개까지 가능합니다. 과목 이동과 삭제는 최대 100개까지 처리됩니다.
        </p>
      )}
      {children}
    </form>
  );
}
