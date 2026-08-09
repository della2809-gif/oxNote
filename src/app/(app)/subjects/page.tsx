import { createClient } from "@/lib/supabase/server";
import type { Subject } from "@/lib/types";
import { createSubject, deleteSubject } from "./actions";

export default async function SubjectsPage() {
  const supabase = await createClient();
  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, user_id, name, color, created_at")
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">과목 관리</h1>

      <form action={createSubject} className="flex gap-2">
        <input
          name="name"
          placeholder="예: 수학, 영어, 물리..."
          required
          className="w-64 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
        >
          추가
        </button>
      </form>

      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {(subjects as Subject[] | null)?.map((subject) => (
          <li key={subject.id} className="flex items-center justify-between px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: subject.color }}
              />
              {subject.name}
            </span>
            <form action={deleteSubject}>
              <input type="hidden" name="id" value={subject.id} />
              <button type="submit" className="text-sm text-neutral-400 hover:text-red-500">
                삭제
              </button>
            </form>
          </li>
        ))}
        {!subjects?.length && (
          <li className="px-4 py-6 text-center text-sm text-neutral-400">
            아직 등록된 과목이 없습니다.
          </li>
        )}
      </ul>
    </div>
  );
}
