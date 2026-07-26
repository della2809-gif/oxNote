import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Note, Subject } from "@/lib/types";
import { deleteNote } from "../actions";

export default async function NoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: note } = await supabase.from("notes").select("*").eq("id", id).single();
  if (!note) notFound();

  const typedNote = note as Note;
  let subject: Subject | null = null;
  if (typedNote.subject_id) {
    const { data } = await supabase
      .from("subjects")
      .select("*")
      .eq("id", typedNote.subject_id)
      .single();
    subject = data;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          {subject && (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: subject.color }} />
              {subject.name}
            </span>
          )}
          {typedNote.source && <span>· {typedNote.source}</span>}
        </div>
        <form action={deleteNote}>
          <input type="hidden" name="id" value={typedNote.id} />
          <button type="submit" className="text-sm text-neutral-400 hover:text-red-500">
            삭제
          </button>
        </form>
      </div>

      <section className="space-y-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-sm font-medium text-neutral-500">문제</h2>
        <p className="whitespace-pre-wrap text-sm">{typedNote.question}</p>
      </section>

      <div className="grid grid-cols-2 gap-4">
        <section className="space-y-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-medium text-neutral-500">내가 쓴 답</h2>
          <p className="whitespace-pre-wrap text-sm text-red-600 dark:text-red-400">
            {typedNote.my_answer || "(무응답)"}
          </p>
        </section>
        <section className="space-y-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-medium text-neutral-500">정답</h2>
          <p className="whitespace-pre-wrap text-sm text-green-600 dark:text-green-400">
            {typedNote.correct_answer}
          </p>
        </section>
      </div>

      {typedNote.ai_analysis && (
        <section className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950">
          <h2 className="flex items-center gap-2 text-sm font-medium text-indigo-700 dark:text-indigo-300">
            AI 분석 {typedNote.mistake_type && `· ${typedNote.mistake_type}`}
          </h2>
          <p className="whitespace-pre-wrap text-sm text-indigo-900 dark:text-indigo-100">
            {typedNote.ai_analysis}
          </p>
          {typedNote.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {typedNote.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="flex items-center justify-between rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
        <span className="text-neutral-500">
          복습 단계: Box {typedNote.box_level} / 5
        </span>
        {typedNote.mastered ? (
          <span className="font-medium text-green-600">완전 학습 완료</span>
        ) : (
          <span className="text-neutral-500">
            다음 복습: {new Date(typedNote.next_review_at).toLocaleDateString("ko-KR")}
          </span>
        )}
      </section>
    </div>
  );
}
