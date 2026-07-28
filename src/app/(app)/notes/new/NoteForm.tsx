"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import type { Subject } from "@/lib/types";
import { createNote, createNoteFromFile } from "../actions";
import { createSubjectInline } from "../../subjects/actions";

const fieldClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50";

type FileSelection = {
  file: File;
  previewUrl: string | null;
};

function makeSelection(file: File | null): FileSelection | null {
  if (!file) return null;
  return {
    file,
    previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
  };
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden="true">
      <path d="M12 16V4m0 0 4.5 4.5M12 4 7.5 8.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden="true">
      <path d="m7 12 3 1 1 3 1-3 3-1-3-1-1-3-1 3-3 1Zm8-6 1.5.5L17 8l.5-1.5L19 6l-1.5-.5L17 4l-.5 1.5L15 6Z" fill="currentColor" />
    </svg>
  );
}

function SubmitButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={!ready || pending}
      className="w-full rounded-xl bg-indigo-600 px-5 py-4 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
    >
      {pending ? "문제 유형과 풀이를 분석하고 있어요..." : "문제 유형과 풀이 분석하기 →"}
    </button>
  );
}

export default function NoteForm({
  subjects,
  error,
}: {
  subjects: Subject[];
  error?: string;
}) {
  const [mode, setMode] = useState<"file" | "manual">("file");
  const [problem, setProblem] = useState<FileSelection | null>(null);
  const [solution, setSolution] = useState<FileSelection | null>(null);
  const [subjectOptions, setSubjectOptions] = useState(subjects);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const problemInputRef = useRef<HTMLInputElement>(null);
  const solutionInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const url = problem?.previewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [problem?.previewUrl]);

  useEffect(() => {
    const url = solution?.previewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [solution?.previewUrl]);

  function replaceSelection(
    nextFile: File | null,
    current: FileSelection | null,
    setter: (value: FileSelection | null) => void,
  ) {
    if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
    setter(makeSelection(nextFile));
  }

  if (mode === "manual") {
    return (
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={() => setMode("file")}
          className="mb-5 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← 사진·PDF 분석으로 돌아가기
        </button>
        <form action={createNote} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div>
            <h2 className="text-xl font-bold text-slate-900">문제 직접 입력</h2>
            <p className="mt-1 text-sm text-slate-500">파일이 없을 때 문제와 답을 입력해 오답노트를 만들 수 있어요.</p>
          </div>
          <SubjectSelect
            subjects={subjectOptions}
            selectedSubjectId={selectedSubjectId}
            onSelect={setSelectedSubjectId}
            onCreated={(subject) => {
              setSubjectOptions((current) =>
                current.some((item) => item.id === subject.id)
                  ? current
                  : [...current, subject].sort((a, b) => a.name.localeCompare(b.name, "ko")),
              );
              setSelectedSubjectId(subject.id);
            }}
          />
          <label className="block space-y-2 text-sm font-semibold text-slate-700">
            <span>출처 <span className="font-normal text-slate-400">(선택)</span></span>
            <input name="source" className={fieldClass} placeholder="예: 2026년 1학기 중간고사" />
          </label>
          <label className="block space-y-2 text-sm font-semibold text-slate-700">
            <span>문제</span>
            <textarea name="question" required rows={5} className={fieldClass} />
          </label>
          <label className="block space-y-2 text-sm font-semibold text-slate-700">
            <span>내가 쓴 답</span>
            <textarea name="myAnswer" rows={3} className={fieldClass} />
          </label>
          <label className="block space-y-2 text-sm font-semibold text-slate-700">
            <span>정답</span>
            <textarea name="correctAnswer" required rows={3} className={fieldClass} />
          </label>
          <SubmitButton ready />
        </form>
      </div>
    );
  }

  return (
    <form action={createNoteFromFile} className="space-y-5">
      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-medium text-red-600">
          {error}
        </div>
      )}

      <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:p-5">
        <div className="flex items-center gap-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600 text-sm font-bold text-white">1</span>
          <div>
            <p className="text-sm font-bold text-slate-900">문제 사진 또는 PDF를 올려주세요</p>
            <p className="mt-1 text-xs text-slate-400">JPG·PNG·WEBP·PDF · 파일당 최대 15MB</p>
          </div>
        </div>
        <span className="hidden text-xl font-light text-slate-300 sm:block">＋</span>
        <div className="flex items-center gap-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-sm font-bold text-slate-500">2</span>
          <div>
            <p className="text-sm font-bold text-slate-900">학생 풀이를 추가하면 더 정확해요</p>
            <p className="mt-1 text-xs text-slate-400">실제로 막힌 단계와 오류 지점까지 분석</p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div
            className="flex min-h-[410px] flex-col overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const dropped = event.dataTransfer.files?.[0] ?? null;
              if (dropped && problemInputRef.current) {
                const transfer = new DataTransfer();
                transfer.items.add(dropped);
                problemInputRef.current.files = transfer.files;
                replaceSelection(dropped, problem, setProblem);
              }
            }}
          >
            <input
              ref={problemInputRef}
              id="problem-file"
              type="file"
              name="file"
              required
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(event) =>
                replaceSelection(event.target.files?.[0] ?? null, problem, setProblem)
              }
              className="sr-only"
            />

            {problem ? (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
                  <span className="truncate rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-600">
                    문제 사진 · {problem.file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => problemInputRef.current?.click()}
                    className="shrink-0 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    다른 문제 선택
                  </button>
                </div>
                <div className="grid flex-1 place-items-center p-4">
                  {problem.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={problem.previewUrl}
                      alt="선택한 문제 미리보기"
                      className="max-h-[330px] w-full rounded-xl object-contain"
                    />
                  ) : (
                    <div className="text-center">
                      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-indigo-100 text-indigo-600">
                        <span className="text-sm font-bold">PDF</span>
                      </div>
                      <p className="mt-4 max-w-xs break-all text-sm font-semibold text-slate-700">{problem.file.name}</p>
                      <p className="mt-1 text-xs text-slate-400">AI가 PDF의 문제를 읽어 분석합니다.</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <label htmlFor="problem-file" className="grid flex-1 cursor-pointer place-items-center p-8 text-center">
                <span>
                  <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-indigo-100 text-indigo-600">
                    <UploadIcon />
                  </span>
                  <strong className="mt-5 block text-lg text-slate-900">수학 문제 사진·PDF 올리기</strong>
                  <span className="mt-2 block text-sm leading-6 text-slate-500">
                    문제 사진, 시험지 또는 PDF 학습지를 분석할 수 있어요.
                  </span>
                  <span className="mx-auto mt-5 inline-flex rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-sm">
                    + 사진 또는 PDF 선택
                  </span>
                  <span className="mt-3 block text-xs text-slate-400">파일을 이곳에 끌어다 놓아도 됩니다.</span>
                </span>
              </label>
            )}
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-800">학생 풀이 사진·PDF</p>
                <p className="mt-1 text-xs text-slate-400">선택 사항 · 실제 오답 지점을 더 정확하게 찾습니다.</p>
              </div>
              <button
                type="button"
                onClick={() => solutionInputRef.current?.click()}
                className="shrink-0 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-50"
              >
                {solution ? "다시 선택" : "+ 풀이 추가"}
              </button>
            </div>
            <input
              ref={solutionInputRef}
              type="file"
              name="solutionFile"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(event) =>
                replaceSelection(event.target.files?.[0] ?? null, solution, setSolution)
              }
              className="sr-only"
            />
            {solution && (
              <div className="mt-3 flex items-center gap-3 rounded-xl bg-white px-3 py-3 text-xs text-slate-600">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 font-bold text-emerald-600">✓</span>
                <span className="min-w-0 flex-1 truncate">{solution.file.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    if (solutionInputRef.current) solutionInputRef.current.value = "";
                    replaceSelection(null, solution, setSolution);
                  }}
                  className="font-semibold text-slate-400 hover:text-red-500"
                >
                  삭제
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-[560px] flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
              <SparkIcon />
            </span>
            <h2 className="mt-5 text-xl font-bold text-slate-900">
              {problem ? "분석할 준비가 되었어요" : "문제 사진을 분석해 볼까요?"}
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-6 text-slate-500">
              문제 유형, 관련 교육과정, 난이도, 단계별 풀이와 헷갈리기 쉬운 지점을 한 번에 정리해 드려요.
            </p>

            <div className="mt-7 grid w-full gap-3 text-left sm:grid-cols-2">
              <SubjectSelect
                subjects={subjectOptions}
                selectedSubjectId={selectedSubjectId}
                onSelect={setSelectedSubjectId}
                onCreated={(subject) => {
                  setSubjectOptions((current) =>
                    current.some((item) => item.id === subject.id)
                      ? current
                      : [...current, subject].sort((a, b) => a.name.localeCompare(b.name, "ko")),
                  );
                  setSelectedSubjectId(subject.id);
                }}
              />
              <label className="block space-y-2 text-xs font-bold text-slate-600">
                <span>시험·교재 출처 <span className="font-normal text-slate-400">(선택)</span></span>
                <input name="source" className={fieldClass} placeholder="예: 중2 수학 중간고사" />
              </label>
            </div>

            <div className="mt-4 grid w-full gap-3 text-left sm:grid-cols-2">
              <label className="block space-y-2 text-xs font-bold text-slate-600">
                <span>내가 쓴 답 <span className="font-normal text-slate-400">(선택)</span></span>
                <input name="myAnswerHint" className={fieldClass} placeholder="파일에 없으면 입력" />
              </label>
              <label className="block space-y-2 text-xs font-bold text-slate-600">
                <span>정답 <span className="font-normal text-slate-400">(선택)</span></span>
                <input name="correctAnswerHint" className={fieldClass} placeholder="알고 있다면 입력" />
              </label>
            </div>
          </div>

          <div className="mt-7 space-y-4">
            <SubmitButton ready={Boolean(problem)} />
            <button
              type="button"
              onClick={() => setMode("manual")}
              className="w-full text-center text-sm font-semibold text-slate-400 hover:text-indigo-600"
            >
              파일 없이 문제 직접 입력하기
            </button>
          </div>
        </section>
      </div>
    </form>
  );
}

function SubjectSelect({
  subjects,
  selectedSubjectId,
  onSelect,
  onCreated,
}: {
  subjects: Subject[];
  selectedSubjectId: string;
  onSelect: (id: string) => void;
  onCreated: (subject: Subject) => void;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [addError, setAddError] = useState("");
  const [isPending, startTransition] = useTransition();

  function addSubject() {
    startTransition(async () => {
      const result = await createSubjectInline(newSubjectName);
      if (!result.subject) {
        setAddError(result.error ?? "과목을 추가하지 못했습니다.");
        return;
      }
      onCreated(result.subject);
      setNewSubjectName("");
      setAddError("");
      setIsAdding(false);
    });
  }

  return (
    <div className="space-y-2 text-xs font-bold text-slate-600">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="note-subject">과목</label>
        <button
          type="button"
          onClick={() => {
            setIsAdding((current) => !current);
            setAddError("");
          }}
          className="font-bold text-indigo-600 hover:text-indigo-700"
        >
          {isAdding ? "취소" : "+ 과목 추가"}
        </button>
      </div>
      <select
        id="note-subject"
        name="subjectId"
        value={selectedSubjectId}
        onChange={(event) => onSelect(event.target.value)}
        className={fieldClass}
      >
        <option value="">AI가 자동 분류</option>
        {subjects.map((subject) => (
          <option key={subject.id} value={subject.id}>
            {subject.name}
          </option>
        ))}
      </select>
      {isAdding && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
          <div className="flex gap-2">
            <input
              value={newSubjectName}
              onChange={(event) => setNewSubjectName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (newSubjectName.trim() && !isPending) addSubject();
                }
              }}
              maxLength={40}
              placeholder="예: 과학, 토익, 공인중개사"
              className="min-w-0 flex-1 rounded-lg border border-indigo-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-indigo-400"
            />
            <button
              type="button"
              onClick={addSubject}
              disabled={!newSubjectName.trim() || isPending}
              className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2.5 text-xs font-bold text-white disabled:bg-slate-300"
            >
              {isPending ? "추가 중" : "추가"}
            </button>
          </div>
          {addError && <p className="mt-2 text-xs font-medium text-red-500">{addError}</p>}
        </div>
      )}
    </div>
  );
}
