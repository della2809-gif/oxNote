import { createClient } from "@/lib/supabase/server";
import type { Note } from "@/lib/types";
import { submitReview } from "../notes/actions";
import OriginalSourceToggle from "./OriginalSourceToggle";

export default async function ReviewPage() {
  const supabase = await createClient();

  const { data: dueNotes } = await supabase
    .from("notes")
    .select("*")
    .eq("mastered", false)
    .lte("next_review_at", new Date().toISOString())
    .order("next_review_at", { ascending: true })
    .limit(20);

  const notes = (dueNotes as Note[] | null) ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">오늘의 복습</h1>
        <p className="text-sm text-neutral-500">{notes.length}개의 오답이 복습 대기 중입니다.</p>
      </div>

      {notes.length === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-400 dark:border-neutral-700">
          오늘 복습할 오답이 없습니다. 잘하고 있어요!
        </div>
      )}

      <ul className="space-y-4">
        {notes.map((note) => (
          <li key={note.id} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-xs text-neutral-500">Box {note.box_level} / 5</p>
              {note.source && <p className="text-xs text-neutral-500">{note.source}</p>}
            </div>

            <div className="space-y-4">
              <p className="whitespace-pre-wrap break-words text-base font-medium leading-7">
                {note.question}
              </p>
            </div>

            {note.source_file_url && <OriginalSourceToggle noteId={note.id} />}

            <details className="mt-3 rounded-md bg-neutral-50 p-3 text-sm dark:bg-neutral-900">
              <summary className="cursor-pointer font-medium text-neutral-600 dark:text-neutral-300">
                정답 및 해설 보기
              </summary>
              <div className="mt-2 space-y-2">
                <p>
                  <span className="font-medium text-green-600 dark:text-green-400">정답: </span>
                  {note.correct_answer}
                </p>
                {note.ai_analysis && (
                  <p className="text-neutral-600 dark:text-neutral-400">{note.ai_analysis}</p>
                )}
              </div>
            </details>

            <form action={submitReview} className="mt-3 flex gap-2">
              <input type="hidden" name="id" value={note.id} />
              <button
                type="submit"
                name="result"
                value="correct"
                className="flex-1 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-500"
              >
                맞았어요
              </button>
              <button
                type="submit"
                name="result"
                value="incorrect"
                className="flex-1 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
              >
                틀렸어요
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
