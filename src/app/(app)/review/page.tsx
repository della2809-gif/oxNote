import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Note, NoteAiDetails, Subject } from "@/lib/types";
import { submitReview } from "../notes/actions";
import { createReviewGoal, deleteReviewGoal } from "./actions";
import OriginalSourceToggle from "./OriginalSourceToggle";

type ReviewGoal = {
  id: string;
  subject_id: string | null;
  name: string;
  start_date: string;
  end_date: string;
  topics: string[];
};

// 추가 기능이 확정될 때까지 시험 목표 복습 메뉴를 노출하지 않습니다.
const REVIEW_GOALS_ENABLED = false;

function noteTopics(note: Note) {
  const details =
    note.ai_details && typeof note.ai_details === "object"
      ? (note.ai_details as Partial<NoteAiDetails>)
      : {};
  return Array.from(
    new Set([
      ...(note.tags ?? []).filter((tag) => !tag.startsWith("학습상태:")),
      ...(Array.isArray(details.coreConcepts) ? details.coreConcepts : []),
      ...(note.mistake_type ? [note.mistake_type] : []),
    ]),
  ).filter(Boolean);
}

function scheduleLabel(note: Note) {
  if (note.box_level <= 1) return "등록 3일 후 첫 복습";
  if (note.box_level === 2) return "7일 후 재복습";
  return "30일 후 재복습";
}

function reviewHref(goalId?: string, subjectId?: string, topic?: string) {
  const params = new URLSearchParams();
  if (goalId) params.set("goal", goalId);
  if (subjectId) params.set("subject", subjectId);
  if (topic) params.set("topic", topic);
  const query = params.toString();
  return query ? `/review?${query}` : "/review";
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    goal?: string;
    subject?: string;
    topic?: string;
    error?: string;
    success?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const now = new Date();

  const [
    { data: notesData },
    { data: subjectsData },
    { data: goalsData },
  ] = await Promise.all([
    supabase
      .from("notes")
      .select("id, subject_id, source, source_file_url, question, correct_answer, ai_analysis, ai_details, mistake_type, tags, box_level, next_review_at, mastered")
      .eq("mastered", false)
      .order("next_review_at", { ascending: true })
      .limit(200),
    supabase.from("subjects").select("id, name, color").order("name"),
    supabase
      .from("review_goals")
      .select("id, subject_id, name, start_date, end_date, topics")
      .order("start_date", { ascending: true }),
  ]);

  const allNotes = (notesData as Note[] | null) ?? [];
  const subjects = (subjectsData as Subject[] | null) ?? [];
  const goals = (goalsData as ReviewGoal[] | null) ?? [];
  const activeGoal = REVIEW_GOALS_ENABLED
    ? goals.find((goal) => goal.id === params.goal)
    : undefined;
  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]));
  const availableTopics = Array.from(
    new Set(allNotes.flatMap(noteTopics)),
  ).sort((a, b) => a.localeCompare(b, "ko"));

  const goalTopics = activeGoal?.topics?.length
    ? activeGoal.topics
    : availableTopics;
  const selectedSubject = activeGoal?.subject_id ?? params.subject ?? "";
  const selectedTopic = params.topic ?? "";

  const filteredByFocus = allNotes.filter((note) => {
    if (selectedSubject && note.subject_id !== selectedSubject) return false;
    const topics = noteTopics(note);
    if (
      activeGoal?.topics?.length
      && !activeGoal.topics.some((topic) => topics.includes(topic))
    ) {
      return false;
    }
    if (selectedTopic && !topics.includes(selectedTopic)) return false;
    return true;
  });

  const notes = activeGoal
    ? filteredByFocus
    : filteredByFocus.filter(
        (note) => new Date(note.next_review_at).getTime() <= now.getTime(),
      );
  const nextScheduled = filteredByFocus.find(
    (note) => new Date(note.next_review_at).getTime() > now.getTime(),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 text-slate-900">
      <header>
        <p className="text-sm font-bold text-indigo-600">스마트 복습 일정</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">복습하기</h1>
      </header>

      {params.error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{params.error}</p>}
      {params.success && <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{params.success}</p>}

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm sm:p-6">
        <div>
          <h2 className="text-lg font-bold sm:text-xl">
            {activeGoal ? `${activeGoal.name} 집중 복습` : "오늘의 복습"}
            <span className="ml-2 text-base font-medium text-slate-600">({notes.length}개)</span>
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-slate-600">
            {activeGoal
              ? "선택한 시험 목표에 맞는 오답을 집중적으로 복습합니다."
              : "오답은 등록 3일 후 나타납니다. 맞히면 보관되고, 다시 틀리면 7일 후에 복습합니다."}
          </p>
        </div>

        {!activeGoal && (
          <nav className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            <Link href={reviewHref()} className={`rounded-full border px-3 py-1.5 text-sm ${!selectedSubject ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}>전체 과목</Link>
            {subjects.map((subject) => (
              <Link key={subject.id} href={reviewHref(undefined, subject.id)} className={`rounded-full border px-3 py-1.5 text-sm ${selectedSubject === subject.id ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white"}`}>{subject.name}</Link>
            ))}
          </nav>
        )}

        {notes.length === 0 && (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500 sm:py-12">
            <p>현재 조건에 맞는 복습 문제가 없습니다.</p>
            {nextScheduled && (
              <p className="mt-2 text-xs">
                다음 기본 복습: {new Date(nextScheduled.next_review_at).toLocaleDateString("ko-KR")}
              </p>
            )}
          </div>
        )}

        <ul className="mt-4 space-y-4">
          {notes.map((note) => (
            <li key={note.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-indigo-50 px-2.5 py-1 font-semibold text-indigo-700">{subjectMap.get(note.subject_id ?? "")?.name ?? "미분류"}</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{scheduleLabel(note)}</span>
                </div>
                {note.source && <p className="text-xs text-slate-500">{note.source}</p>}
              </div>

              <p className="whitespace-pre-wrap break-words text-base font-medium leading-7">{note.question}</p>
              {note.source_file_url && <OriginalSourceToggle noteId={note.id} />}

              <details className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                <summary className="cursor-pointer font-medium text-slate-600">정답 및 해설 보기</summary>
                <div className="mt-2 space-y-2">
                  <p><span className="font-medium text-green-600">정답: </span>{note.correct_answer}</p>
                  {note.ai_analysis && <p className="text-slate-600">{note.ai_analysis}</p>}
                </div>
              </details>

              <form action={submitReview} className="mt-4 flex gap-2">
                <input type="hidden" name="id" value={note.id} />
                <button type="submit" name="result" value="correct" className="flex-1 rounded-lg bg-green-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-green-500">
                  맞았어요 · 보관
                </button>
                <button type="submit" name="result" value="incorrect" className="flex-1 rounded-lg bg-red-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-red-500">
                  틀렸어요 · 다시 예약
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      {REVIEW_GOALS_ENABLED && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">시험 목표 복습</h2>
            <p className="mt-1 text-sm text-slate-500">시험 기간과 과목·주제를 정해 해당 오답만 집중적으로 복습하세요.</p>
          </div>
          <details className="w-full rounded-xl border border-indigo-200 bg-indigo-50 p-4 lg:w-auto lg:min-w-[240px]">
            <summary className="cursor-pointer text-sm font-semibold text-indigo-700">▸ + 새 시험 목표 만들기</summary>
            <form action={createReviewGoal} className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                목표명
                <input name="name" required maxLength={80} placeholder="예: 중간고사 대비" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                시작일
                <input name="startDate" type="date" required className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                시험일·종료일
                <input name="endDate" type="date" required className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                과목
                <select name="subjectId" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                  <option value="">전체 과목</option>
                  {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                </select>
              </label>
              <fieldset className="sm:col-span-2">
                <legend className="text-xs font-semibold text-slate-600">집중할 주제 (선택)</legend>
                <div className="mt-2 flex max-h-36 flex-wrap gap-2 overflow-y-auto">
                  {availableTopics.map((topic) => (
                    <label key={topic} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs">
                      <input type="checkbox" name="topics" value={topic} />
                      {topic}
                    </label>
                  ))}
                  {!availableTopics.length && <span className="text-xs text-slate-400">오답이 등록되면 주제를 선택할 수 있습니다.</span>}
                </div>
              </fieldset>
              <button className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white sm:col-span-2">목표 저장</button>
            </form>
          </details>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/review" className={`rounded-full px-3 py-1.5 text-sm ${!activeGoal ? "bg-slate-900 text-white" : "bg-slate-100"}`}>
            기본 복습
          </Link>
          {goals.map((goal) => (
            <Link key={goal.id} href={reviewHref(goal.id)} className={`rounded-full px-3 py-1.5 text-sm ${activeGoal?.id === goal.id ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-700"}`}>
              {goal.name} · {goal.start_date.slice(5)}–{goal.end_date.slice(5)}
            </Link>
          ))}
        </div>

        {activeGoal && (
          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold">{activeGoal.name}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {activeGoal.start_date} ~ {activeGoal.end_date}
                  {activeGoal.subject_id && ` · ${subjectMap.get(activeGoal.subject_id)?.name ?? "선택 과목"}`}
                </p>
              </div>
              <form action={deleteReviewGoal}>
                <input type="hidden" name="goalId" value={activeGoal.id} />
                <button className="text-xs font-semibold text-red-600">목표 삭제</button>
              </form>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={reviewHref(activeGoal.id)} className={`rounded-full px-3 py-1 text-xs ${!selectedTopic ? "bg-slate-900 text-white" : "bg-white"}`}>전체 주제</Link>
              {goalTopics.map((topic) => (
                <Link key={topic} href={reviewHref(activeGoal.id, undefined, topic)} className={`rounded-full px-3 py-1 text-xs ${selectedTopic === topic ? "bg-indigo-600 text-white" : "bg-white"}`}>
                  {topic}
                </Link>
              ))}
            </div>
          </div>
        )}
        </section>
      )}
    </div>
  );
}
