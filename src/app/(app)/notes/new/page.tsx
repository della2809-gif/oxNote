import { createClient } from "@/lib/supabase/server";
import type { Subject } from "@/lib/types";
import { createNote } from "../actions";

export default async function NewNotePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: subjects } = await supabase.from("subjects").select("*").order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">오답 추가</h1>
      <p className="text-sm text-neutral-500">
        저장하면 Claude가 오답 원인을 자동으로 분석해 드립니다.
      </p>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      <form action={createNote} className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">과목</label>
          <select
            name="subjectId"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="">선택 안 함</option>
            {(subjects as Subject[] | null)?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">출처 (선택, 예: 2026 1학기 중간고사)</label>
          <input
            name="source"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">문제</label>
          <textarea
            name="question"
            required
            rows={4}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">내가 쓴 답</label>
          <textarea
            name="myAnswer"
            rows={2}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">정답</label>
          <textarea
            name="correctAnswer"
            required
            rows={2}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
        >
          저장하고 AI 분석 받기
        </button>
      </form>
    </div>
  );
}
