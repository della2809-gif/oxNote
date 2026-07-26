import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Note, Subject } from "@/lib/types";

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const { subject: subjectFilter } = await searchParams;
  const supabase = await createClient();

  const { data: subjects } = await supabase.from("subjects").select("*").order("name");

  let query = supabase
    .from("notes")
    .select("*")
    .order("created_at", { ascending: false });

  if (subjectFilter) query = query.eq("subject_id", subjectFilter);

  const { data: notes } = await query;
  const subjectMap = new Map((subjects as Subject[] | null)?.map((s) => [s.id, s]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">오답노트</h1>
        <Link
          href="/notes/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
        >
          + 오답 추가
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href="/notes"
          className={`rounded-full border px-3 py-1 ${
            !subjectFilter
              ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
              : "border-neutral-300 dark:border-neutral-700"
          }`}
        >
          전체
        </Link>
        {(subjects as Subject[] | null)?.map((s) => (
          <Link
            key={s.id}
            href={`/notes?subject=${s.id}`}
            className={`rounded-full border px-3 py-1 ${
              subjectFilter === s.id
                ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                : "border-neutral-300 dark:border-neutral-700"
            }`}
          >
            {s.name}
          </Link>
        ))}
      </div>

      <ul className="space-y-3">
        {(notes as Note[] | null)?.map((note) => {
          const subject = note.subject_id ? subjectMap.get(note.subject_id) : undefined;
          return (
            <li key={note.id}>
              <Link
                href={`/notes/${note.id}`}
                className="block rounded-lg border border-neutral-200 p-4 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
              >
                <div className="mb-1 flex items-center gap-2 text-xs text-neutral-500">
                  {subject && (
                    <span className="flex items-center gap-1">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: subject.color }}
                      />
                      {subject.name}
                    </span>
                  )}
                  {note.mistake_type && <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">{note.mistake_type}</span>}
                  {note.mastered && <span className="text-green-600">완전 학습</span>}
                </div>
                <p className="line-clamp-2 text-sm font-medium">{note.question}</p>
              </Link>
            </li>
          );
        })}
        {!notes?.length && (
          <li className="rounded-lg border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-400 dark:border-neutral-700">
            아직 등록된 오답이 없습니다. 첫 오답을 추가해보세요.
          </li>
        )}
      </ul>
    </div>
  );
}
