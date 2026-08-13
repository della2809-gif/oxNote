import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Note, NoteAiDetails, Subject } from "@/lib/types";
import { BulkNotesForm } from "./BulkNotesForm";
import SortMenu from "./SortMenu";

type ClassificationKey = "unit" | "source" | "type" | "concept" | "reason";
type SortOrder = "newest" | "oldest";

const CLASSIFICATIONS: Array<{
  key: ClassificationKey;
  label: string;
  description: string;
}> = [
  { key: "unit", label: "개념·단원", description: "AI 태그로 묶어보기" },
  { key: "source", label: "시험·교재", description: "출제 출처로 묶어보기" },
  { key: "type", label: "문제 유형", description: "풀이 유형으로 묶어보기" },
  { key: "concept", label: "핵심 개념", description: "풀이에 쓰인 개념으로 묶어보기" },
  { key: "reason", label: "오답 이유", description: "틀린 원인으로 묶어보기" },
];

function asDetails(value: unknown): Partial<NoteAiDetails> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Partial<NoteAiDetails>;
}

function classificationValues(note: Note, key: ClassificationKey): string[] {
  const details = asDetails(note.ai_details);
  switch (key) {
    case "unit":
      return (note.tags ?? []).filter(Boolean);
    case "source":
      return note.source ? [note.source] : [];
    case "type":
      return details.questionType ? [details.questionType] : [];
    case "concept":
      return Array.isArray(details.coreConcepts) ? details.coreConcepts.filter(Boolean) : [];
    case "reason":
      return note.mistake_type ? [note.mistake_type] : [];
  }
}

function noteSearchText(note: Note) {
  const details = asDetails(note.ai_details);
  return [
    note.question,
    note.correct_answer,
    note.source,
    note.mistake_type,
    note.user_mistake_reason,
    ...(note.tags ?? []),
    details.title,
    details.subject,
    details.curriculum,
    details.questionType,
    ...(Array.isArray(details.coreConcepts) ? details.coreConcepts : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("ko");
}

function notesHref({
  subject,
  classification,
  value,
  query,
  sort,
}: {
  subject?: string;
  classification?: ClassificationKey;
  value?: string;
  query?: string;
  sort?: SortOrder;
}) {
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (classification) params.set("classification", classification);
  if (value) params.set("value", value);
  if (query) params.set("q", query);
  if (sort === "oldest") params.set("sort", sort);
  const search = params.toString();
  return search ? `/notes?${search}` : "/notes";
}

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{
    subject?: string;
    classification?: string;
    value?: string;
    q?: string;
    sort?: string;
    error?: string;
    success?: string;
  }>;
}) {
  const params = await searchParams;
  const subjectFilter = params.subject ?? "";
  const classification = subjectFilter && CLASSIFICATIONS.some((item) => item.key === params.classification)
    ? (params.classification as ClassificationKey)
    : undefined;
  const valueFilter = classification ? (params.value?.trim() ?? "") : "";
  const searchQuery = params.q?.trim() ?? "";
  const sortOrder: SortOrder = params.sort === "oldest" ? "oldest" : "newest";

  const supabase = await createClient();
  let notesQuery = supabase
    .from("notes")
    .select("id, subject_id, source, question, correct_answer, ai_details, mistake_type, user_mistake_reason, tags, mastered, created_at, updated_at")
    .order("updated_at", { ascending: sortOrder === "oldest" });
  if (subjectFilter) notesQuery = notesQuery.eq("subject_id", subjectFilter);
  const [{ data: subjectsData }, { data: notesData }] = await Promise.all([
    supabase.from("subjects").select("id, name, color").order("name"),
    notesQuery,
  ]);

  const subjects = (subjectsData as Subject[] | null) ?? [];
  const allNotes = (notesData as Note[] | null) ?? [];
  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]));

  const subjectNotes = allNotes;

  const availableValues = classification
    ? Array.from(
        new Set(subjectNotes.flatMap((note) => classificationValues(note, classification))),
      ).sort((a, b) => a.localeCompare(b, "ko"))
    : [];

  const normalizedQuery = searchQuery.toLocaleLowerCase("ko");
  const filteredNotes = subjectNotes.filter((note) => {
    if (
      classification &&
      valueFilter &&
      !classificationValues(note, classification).includes(valueFilter)
    ) {
      return false;
    }
    if (normalizedQuery && !noteSearchText(note).includes(normalizedQuery)) return false;
    return true;
  });

  const activeSubject = subjectMap.get(subjectFilter);
  const activeClassification = CLASSIFICATIONS.find((item) => item.key === classification);

  return (
    <div className="space-y-6 text-slate-900">
      <section className="flex flex-wrap items-end justify-between gap-5 rounded-2xl bg-slate-50 p-5 sm:p-7">
        <div>
          <p className="text-sm font-bold text-indigo-600">나의 학습 라이브러리</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">오답노트</h1>
          <p className="mt-2 text-sm text-slate-500">
            과목부터 핵심 개념과 오답 이유까지, 원하는 기준으로 다시 찾아보세요.
          </p>
        </div>
        <Link
          href="/notes/new"
          className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-100 transition hover:bg-indigo-700"
        >
          + 새 문제 분석
        </Link>
      </section>

      {params.error && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {params.error}
        </p>
      )}
      {params.success && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {params.success}
        </p>
      )}

      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">과목별 보기</p>
            <Link href="/subjects" className="text-xs font-bold text-indigo-600 hover:text-indigo-700">과목 관리 →</Link>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href={notesHref({ query: searchQuery, sort: sortOrder })}
              className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-bold transition ${
                !subjectFilter
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              전체
            </Link>
            {subjects.map((subject) => (
              <Link
                key={subject.id}
                href={notesHref({
                  subject: subject.id,
                  classification,
                  query: searchQuery,
                  sort: sortOrder,
                })}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-bold transition ${
                  subjectFilter === subject.id
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: subjectFilter === subject.id ? "white" : subject.color }}
                />
                {subject.name}
              </Link>
            ))}
            {!subjects.length && (
              <Link
                href="/notes/new"
                className="shrink-0 whitespace-nowrap rounded-full border border-dashed border-indigo-300 px-4 py-2 text-sm font-bold text-indigo-600"
              >
                + 첫 과목 추가
              </Link>
            )}

            <span className="hidden h-7 w-px bg-slate-200 sm:block" />

            <SortMenu
              sortOrder={sortOrder}
              newestHref={notesHref({ subject: subjectFilter, classification, value: valueFilter, query: searchQuery, sort: "newest" })}
              oldestHref={notesHref({ subject: subjectFilter, classification, value: valueFilter, query: searchQuery, sort: "oldest" })}
            />

            <details className="relative shrink-0">
              <summary className={`cursor-pointer list-none whitespace-nowrap rounded-full border px-4 py-2 text-sm font-bold transition [&::-webkit-details-marker]:hidden ${searchQuery ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}>
                필터 ▾
              </summary>
              <form action="/notes" method="get" className="absolute right-0 z-20 mt-2 w-[min(88vw,28rem)] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                {subjectFilter && <input type="hidden" name="subject" value={subjectFilter} />}
                {classification && <input type="hidden" name="classification" value={classification} />}
                {valueFilter && <input type="hidden" name="value" value={valueFilter} />}
                {sortOrder === "oldest" && <input type="hidden" name="sort" value="oldest" />}
                <label className="block text-xs font-bold text-slate-500">
                  검색어
                  <input
                    type="search"
                    name="q"
                    defaultValue={searchQuery}
                    placeholder="문제, 출처, 개념, 내가 틀린 이유"
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:bg-white"
                  />
                </label>
                <div className="mt-3 flex justify-end gap-2">
                  {(subjectFilter || classification || valueFilter || searchQuery || sortOrder === "oldest") && (
                    <Link href="/notes" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-500">초기화</Link>
                  )}
                  <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">필터 적용</button>
                </div>
              </form>
            </details>
          </div>
        </div>

        {subjectFilter && (
          <div className="border-t border-slate-100 pt-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">분류 기준</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-5">
              {CLASSIFICATIONS.map((item) => (
                <Link
                  key={item.key}
                  href={notesHref({
                    subject: subjectFilter,
                    classification: item.key,
                    query: searchQuery,
                    sort: sortOrder,
                  })}
                  className={`rounded-xl border p-3 transition ${
                    classification === item.key
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-slate-200 hover:border-indigo-200 hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`block text-sm font-bold ${
                      classification === item.key ? "text-indigo-700" : "text-slate-700"
                    }`}
                  >
                    {item.label}
                  </span>
                  <span className="mt-1 block text-xs text-slate-400">{item.description}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {classification && (
          <div className="mt-5 rounded-2xl bg-slate-50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={notesHref({
                  subject: subjectFilter,
                  classification,
                  query: searchQuery,
                  sort: sortOrder,
                })}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                  !valueFilter ? "bg-slate-900 text-white" : "bg-white text-slate-500"
                }`}
              >
                {activeClassification?.label} 전체
              </Link>
              {availableValues.map((value) => (
                <Link
                  key={value}
                  href={notesHref({
                    subject: subjectFilter,
                    classification,
                    value,
                    query: searchQuery,
                    sort: sortOrder,
                  })}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    valueFilter === value
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-slate-600 hover:bg-indigo-50"
                  }`}
                >
                  {value}
                </Link>
              ))}
              {!availableValues.length && (
                <span className="text-xs text-slate-400">
                  이 기준으로 분류된 오답이 아직 없습니다.
                </span>
              )}
            </div>
          </div>
        )}
      </section>

      <BulkNotesForm
        heading={`${activeSubject?.name ?? "전체 과목"}${activeClassification ? ` · ${valueFilter || activeClassification.label}` : ""}`}
        resultCount={filteredNotes.length}
        subjects={subjects.map((subject) => ({ id: subject.id, name: subject.name }))}
        returnTo={notesHref({
          subject: subjectFilter,
          classification,
          value: valueFilter,
          query: searchQuery,
          sort: sortOrder,
        })}
      >
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {filteredNotes.map((note) => {
            const subject = note.subject_id ? subjectMap.get(note.subject_id) : undefined;
            const details = asDetails(note.ai_details);
            const concepts = Array.isArray(details.coreConcepts)
              ? details.coreConcepts.slice(0, 2)
              : [];

            return (
              <li key={note.id} className="relative">
                <label className="absolute left-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 cursor-pointer place-items-center rounded-xl border border-slate-200 bg-white shadow-sm sm:left-4">
                  <span className="sr-only">이 문제 선택</span>
                  <input
                    type="checkbox"
                    name="ids"
                    value={note.id}
                    className="h-4 w-4 accent-indigo-600"
                  />
                </label>
                <Link
                  href={`/notes/${note.id}`}
                  className="group block py-4 pl-[4.25rem] pr-4 transition hover:bg-slate-50 sm:pl-16 sm:pr-5"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {subject && (
                      <span
                        className="flex items-center gap-1.5 rounded-full px-2.5 py-1 font-bold"
                        style={{ color: subject.color, backgroundColor: `${subject.color}14` }}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: subject.color }}
                        />
                        {subject.name}
                      </span>
                    )}
                    {note.source && (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-500">
                        {note.source}
                      </span>
                    )}
                    {details.questionType && (
                      <span className="rounded-full bg-indigo-50 px-2.5 py-1 font-medium text-indigo-600">
                        {details.questionType}
                      </span>
                    )}
                    {note.mastered && (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-bold text-emerald-600">
                        완전 학습
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-col items-start gap-2 sm:flex-row sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-sm font-bold leading-6 text-slate-800 group-hover:text-indigo-700">
                        {details.title || note.question}
                      </p>
                      {details.title && (
                        <p className="mt-1 line-clamp-1 text-xs text-slate-400">{note.question}</p>
                      )}
                    </div>
                    <span className="flex shrink-0 items-center gap-3 self-end text-xs text-slate-400 sm:self-auto">
                      {new Date(note.updated_at).toLocaleDateString("ko-KR")}
                      <span className="text-base text-slate-300 transition group-hover:translate-x-1 group-hover:text-indigo-500">→</span>
                    </span>
                  </div>

                  {(concepts.length > 0 || note.user_mistake_reason) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {concepts.map((concept) => (
                        <span key={concept} className="text-xs font-medium text-slate-500">
                          #{concept}
                        </span>
                      ))}
                      {note.user_mistake_reason && (
                        <span className="min-w-0 flex-1 truncate text-right text-xs text-amber-700">
                          내가 틀린 이유 · {note.user_mistake_reason}
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
          {!filteredNotes.length && (
            <li className="rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-14 text-center">
              <p className="text-sm font-bold text-slate-600">조건에 맞는 오답이 없습니다.</p>
              <p className="mt-2 text-xs text-slate-400">필터를 초기화하거나 새 문제를 분석해 보세요.</p>
              <div className="mt-5 flex justify-center gap-2">
                <Link
                  href="/notes"
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600"
                >
                  전체 보기
                </Link>
                <Link
                  href="/notes/new"
                  className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white"
                >
                  + 새 문제 분석
                </Link>
              </div>
            </li>
          )}
        </ul>
      </BulkNotesForm>
    </div>
  );
}
