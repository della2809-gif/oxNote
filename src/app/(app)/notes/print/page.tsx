import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Note, NoteAiDetails, Subject } from "@/lib/types";
import PrintToolbar from "./PrintToolbar";

function asDetails(value: unknown): Partial<NoteAiDetails> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Partial<NoteAiDetails>;
}

async function signedImageUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string | null,
) {
  if (!path || path.toLowerCase().endsWith(".pdf")) return null;
  const { data } = await supabase.storage.from("note-files").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

function compactText(value: string | null | undefined, maxLength: number) {
  const text = value?.trim() ?? "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}…`;
}

export default async function PrintNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawIds = Array.isArray(params.ids) ? params.ids : params.ids ? [params.ids] : [];
  const ids = Array.from(new Set(rawIds)).slice(0, 20);

  if (ids.length === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-xl font-bold">인쇄할 문제를 선택해 주세요</h1>
        <p className="mt-2 text-sm text-slate-500">
          오답노트 목록에서 체크박스로 문제를 선택할 수 있습니다.
        </p>
        <Link
          href="/notes"
          className="mt-5 inline-flex rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white"
        >
          오답노트로 돌아가기
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: notesData }, { data: subjectsData }] = await Promise.all([
    supabase.from("notes").select("*").in("id", ids),
    supabase.from("subjects").select("*"),
  ]);
  const notes = (notesData as Note[] | null) ?? [];
  const noteMap = new Map(notes.map((note) => [note.id, note]));
  const orderedNotes = ids.map((id) => noteMap.get(id)).filter((note): note is Note => Boolean(note));
  const subjects = (subjectsData as Subject[] | null) ?? [];
  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]));
  const imageUrls = new Map(
    await Promise.all(
      orderedNotes.map(async (note) => [
        note.id,
        await signedImageUrl(supabase, note.source_file_url),
      ] as const),
    ),
  );

  return (
    <div className="print-document mx-auto max-w-[210mm]">
      <PrintToolbar count={orderedNotes.length} />
      <div className="space-y-6 print:space-y-0">
        {orderedNotes.map((note, noteIndex) => {
          const details = asDetails(note.ai_details);
          const subject = note.subject_id ? subjectMap.get(note.subject_id) : null;
          const steps = Array.isArray(details.solutionSteps) ? details.solutionSteps.slice(0, 4) : [];
          const confusionPoints = Array.isArray(details.confusionPoints)
            ? details.confusionPoints.slice(0, 3)
            : [];
          const imageUrl = imageUrls.get(note.id);

          return (
            <article key={note.id} className="print-sheet">
              <header className="print-sheet-header flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-indigo-600">
                    xonote · AI 오답노트
                  </p>
                  <h1 className="mt-1.5 text-lg font-bold leading-tight text-slate-950">
                    {compactText(details.title || note.question, 90)}
                  </h1>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[8px] font-semibold">
                    {subject && <span className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-700">{subject.name}</span>}
                    {details.questionType && <span className="rounded-full bg-rose-50 px-2 py-1 text-rose-600">{details.questionType}</span>}
                    {details.difficulty && <span className="rounded-full bg-rose-50 px-2 py-1 text-rose-600">난이도 {details.difficulty}</span>}
                    {note.source && <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{compactText(note.source, 35)}</span>}
                  </div>
                </div>
                <span className="shrink-0 text-[9px] font-medium text-slate-400">
                  {noteIndex + 1} / {orderedNotes.length}
                </span>
              </header>

              <div className="mt-3 grid min-h-0 grid-cols-[0.9fr_1.1fr] gap-3">
                <section className="min-h-0 rounded-xl border border-slate-200 p-3">
                  <p className="text-[8px] font-bold text-indigo-600">문제 원본</p>
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl}
                      alt="문제 원본"
                      className="mt-2 h-[52mm] w-full rounded-lg object-contain"
                    />
                  ) : (
                    <p className="mt-2 whitespace-pre-wrap text-[9px] font-medium leading-[1.55] text-slate-800">
                      {compactText(note.question, 650)}
                    </p>
                  )}
                </section>

                <section className="min-h-0 rounded-xl border border-slate-200 p-3">
                  <p className="text-[8px] font-bold text-emerald-600">문제 분석</p>
                  <p className="mt-2 whitespace-pre-wrap text-[9px] font-semibold leading-[1.5] text-slate-900">
                    {compactText(note.question, 430)}
                  </p>
                  <dl className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-2.5 text-[8px]">
                    <div>
                      <dt className="font-bold text-slate-400">핵심 개념</dt>
                      <dd className="mt-0.5 font-semibold text-slate-700">
                        {details.coreConcepts?.slice(0, 4).join(" · ") || "-"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-bold text-slate-400">내가 선택한 답 / 정답</dt>
                      <dd className="mt-0.5 font-semibold text-slate-700">
                        {compactText(note.my_answer, 70) || "-"} / {compactText(note.correct_answer, 90)}
                      </dd>
                    </div>
                  </dl>
                </section>
              </div>

              <section className="mt-3 rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[8px] font-bold text-indigo-600">단계별 풀이</p>
                  <p className="text-[8px] font-bold text-emerald-600">
                    정답 · {compactText(details.answerSummary || note.correct_answer, 100)}
                  </p>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                  {steps.map((step, index) => (
                    <div key={`${step.title}-${index}`} className="grid grid-cols-[18px_1fr] gap-2 border-t border-slate-100 pt-2">
                      <span className="grid h-[18px] w-[18px] place-items-center rounded-md bg-indigo-50 text-[8px] font-bold text-indigo-600">
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-[8px] font-bold text-slate-800">{compactText(step.title, 45)}</p>
                        <p className="mt-0.5 text-[7.5px] leading-[1.45] text-slate-600">
                          {compactText(`${step.explanation} ${step.formula}`, 180)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {steps.length === 0 && (
                    <p className="col-span-2 text-[8px] text-slate-500">
                      {compactText(note.ai_analysis, 500) || "저장된 단계별 풀이가 없습니다."}
                    </p>
                  )}
                </div>
              </section>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <section className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[8px] font-bold text-indigo-600">다시 확인할 지점</p>
                  <ol className="mt-2 space-y-1.5">
                    {confusionPoints.map((point, index) => (
                      <li key={`${point.title}-${index}`} className="text-[7.5px] leading-[1.45] text-slate-600">
                        <strong className="text-slate-800">{index + 1}. {compactText(point.title, 45)}</strong>
                        {" · "}
                        {compactText(`${point.explanation} ${point.correction}`, 150)}
                      </li>
                    ))}
                    {confusionPoints.length === 0 && <li className="text-[8px] text-slate-400">저장된 혼동 지점이 없습니다.</li>}
                  </ol>
                </section>

                <section className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[8px] font-bold text-indigo-600">내가 틀린 이유</p>
                  <p className="mt-2 min-h-[20mm] whitespace-pre-wrap rounded-lg bg-slate-50 p-2.5 text-[8px] leading-[1.5] text-slate-700">
                    {compactText(note.user_mistake_reason, 400) || "직접 작성한 오답 이유가 없습니다."}
                  </p>
                </section>
              </div>

              <footer className="mt-auto flex items-center justify-between border-t border-slate-100 pt-2 text-[7px] text-slate-400">
                <span>복습 단계 · Box {note.box_level} / 5</span>
                <span>출력일 · {new Date().toLocaleDateString("ko-KR")}</span>
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
