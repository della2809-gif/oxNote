"use client";

import { useState } from "react";
import type { Subject } from "@/lib/types";
import { createNote, createNoteFromFile } from "../actions";

const inputClass =
  "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export default function NoteForm({ subjects, error }: { subjects: Subject[]; error?: string }) {
  const [mode, setMode] = useState<"manual" | "file">("manual");
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex gap-2 rounded-lg border border-neutral-200 p-1 text-sm dark:border-neutral-800">
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`flex-1 rounded-md py-2 font-medium ${
            mode === "manual"
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
              : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
          }`}
        >
          직접 입력
        </button>
        <button
          type="button"
          onClick={() => setMode("file")}
          className={`flex-1 rounded-md py-2 font-medium ${
            mode === "file"
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
              : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
          }`}
        >
          사진 / PDF 업로드
        </button>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      {mode === "manual" ? (
        <form action={createNote} className="space-y-4">
          <SubjectSelect subjects={subjects} />

          <div className="space-y-1">
            <label className="text-sm font-medium">출처 (선택, 예: 2026 1학기 중간고사)</label>
            <input name="source" className={inputClass} />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">문제</label>
            <textarea name="question" required rows={4} className={inputClass} />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">내가 쓴 답</label>
            <textarea name="myAnswer" rows={2} className={inputClass} />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">정답</label>
            <textarea name="correctAnswer" required rows={2} className={inputClass} />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
          >
            저장하고 AI 분석 받기
          </button>
        </form>
      ) : (
        <form action={createNoteFromFile} className="space-y-4">
          <SubjectSelect subjects={subjects} />

          <div className="space-y-1">
            <label className="text-sm font-medium">출처 (선택)</label>
            <input name="source" className={inputClass} />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">문제 사진 또는 PDF</label>
            <input
              type="file"
              name="file"
              required
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFileName(f?.name ?? null);
                setPreviewUrl((prev) => {
                  if (prev) URL.revokeObjectURL(prev);
                  return f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null;
                });
              }}
              className={inputClass}
            />
            <p className="text-xs text-neutral-400">
              문제, 내가 쓴 답, 정답이 보이는 사진/PDF를 올리면 AI가 자동으로 읽어서 분석합니다. (최대 15MB)
            </p>
            {fileName && <p className="text-xs text-neutral-500">선택된 파일: {fileName}</p>}
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="업로드 미리보기" className="mt-2 max-h-64 rounded-md border border-neutral-200 dark:border-neutral-800" />
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">내가 쓴 답 (선택, 파일에 안 보이면 입력)</label>
            <input name="myAnswerHint" className={inputClass} />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">정답 (선택, 파일에 안 보이면 입력)</label>
            <input name="correctAnswerHint" className={inputClass} />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
          >
            업로드하고 AI 분석 받기
          </button>
        </form>
      )}
    </div>
  );
}

function SubjectSelect({ subjects }: { subjects: Subject[] }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">과목</label>
      <select name="subjectId" className={inputClass}>
        <option value="">선택 안 함</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}
