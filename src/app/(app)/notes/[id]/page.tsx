import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Note, NoteAiDetails, Subject } from "@/lib/types";
import {
  deleteNote,
  updateNoteExtractedContent,
  updateNoteMistakeReason,
} from "../actions";

function asDetails(value: unknown): NoteAiDetails | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const details = value as Partial<NoteAiDetails>;
  if (!details.title || !Array.isArray(details.solutionSteps)) return null;
  return {
    title: details.title,
    subject: details.subject ?? "",
    gradeLevel: details.gradeLevel ?? "",
    curriculum: details.curriculum ?? "",
    difficulty: details.difficulty ?? "",
    questionType: details.questionType ?? "",
    coreConcepts: Array.isArray(details.coreConcepts) ? details.coreConcepts : [],
    solutionSteps: details.solutionSteps,
    answerSummary: details.answerSummary ?? "",
    confusionPoints: Array.isArray(details.confusionPoints) ? details.confusionPoints : [],
  };
}

async function signedFileUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string | null,
) {
  if (!path) return null;
  const { data } = await supabase.storage.from("note-files").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

function FilePreview({
  url,
  path,
  alt,
}: {
  url: string | null;
  path: string | null;
  alt: string;
}) {
  if (!url || !path) return null;
  const isPdf = path.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="grid min-h-72 place-items-center rounded-2xl bg-slate-50 text-center"
      >
        <span>
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-indigo-100 text-sm font-bold text-indigo-600">PDF</span>
          <span className="mt-4 block text-sm font-bold text-indigo-600">업로드한 PDF 열기</span>
        </span>
      </a>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className="h-auto max-h-[520px] w-full max-w-full rounded-2xl bg-slate-50 object-contain"
    />
  );
}

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
  const details = asDetails(typedNote.ai_details);
  let subject: Subject | null = null;
  if (typedNote.subject_id) {
    const { data } = await supabase
      .from("subjects")
      .select("*")
      .eq("id", typedNote.subject_id)
      .single();
    subject = data;
  }

  const [problemFileUrl, solutionFileUrl] = await Promise.all([
    signedFileUrl(supabase, typedNote.source_file_url),
    signedFileUrl(supabase, typedNote.student_solution_file_url),
  ]);

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-4 overflow-x-clip text-slate-900 sm:space-y-6">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <Link href="/notes" className="font-semibold text-indigo-600 hover:text-indigo-700">← 오답노트</Link>
          {subject && (
            <>
              <span>·</span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: subject.color }} />
                {subject.name}
              </span>
            </>
          )}
          {typedNote.source && <span>· {typedNote.source}</span>}
        </div>
        <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
          <Link
            href="/notes/new"
            className="min-w-0 rounded-xl bg-indigo-50 px-2 py-2.5 text-center text-xs font-bold text-indigo-600 transition hover:bg-indigo-100 sm:px-4 sm:text-sm"
          >
            + 새 문제 분석
          </Link>
          <button
            type="submit"
            form="mistake-reason-form"
            className="min-w-0 rounded-xl bg-indigo-600 px-2 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-700 sm:px-4 sm:text-sm"
          >
            저장
          </button>
          <form action={deleteNote} className="min-w-0">
            <input type="hidden" name="id" value={typedNote.id} />
            <button
              type="submit"
              className="w-full min-w-0 rounded-xl border border-rose-200 px-2 py-2.5 text-xs font-bold text-rose-500 transition hover:bg-rose-50 sm:px-4 sm:text-sm"
            >
              삭제
            </button>
          </form>
        </div>
      </div>

      <section className="w-full min-w-0 overflow-hidden rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 shadow-sm sm:rounded-3xl sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-indigo-600">AI 추출 내용 확인</p>
            <h2 className="mt-2 break-keep text-xl font-bold sm:text-2xl">저장된 문제와 정답을 확인해 주세요</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              사진이나 PDF에서 잘못 읽힌 글자, 숫자, 수식 또는 선택지를 직접 고칠 수 있습니다.
              수정한 내용이 오답노트와 복습에 사용됩니다.
            </p>
          </div>
        </div>

        <form action={updateNoteExtractedContent} className="mt-6 space-y-5">
          <input type="hidden" name="id" value={typedNote.id} />
          <label className="block space-y-2 text-sm font-bold text-slate-700">
            <span>문제 전문</span>
            <textarea
              name="question"
              required
              maxLength={12000}
              rows={8}
              defaultValue={typedNote.question}
              className="w-full resize-y rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-medium leading-7 text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-2 text-sm font-bold text-slate-700">
              <span>내가 쓴 답 <span className="font-normal text-slate-400">(선택)</span></span>
              <textarea
                name="myAnswer"
                maxLength={5000}
                rows={4}
                defaultValue={typedNote.my_answer ?? ""}
                className="w-full resize-y rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm leading-7 text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
              />
            </label>
            <label className="block space-y-2 text-sm font-bold text-slate-700">
              <span>정답</span>
              <textarea
                name="correctAnswer"
                required
                maxLength={5000}
                rows={4}
                defaultValue={typedNote.correct_answer}
                className="w-full resize-y rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm leading-7 text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
              />
            </label>
          </div>

          <label className="block space-y-2 text-sm font-bold text-slate-700">
            <span>시험·교재 출처 <span className="font-normal text-slate-400">(선택)</span></span>
            <input
              name="source"
              maxLength={500}
              defaultValue={typedNote.source ?? ""}
              placeholder="예: 중2 영어 중간고사"
              className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
            />
          </label>

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-indigo-700"
            >
              수정 내용 저장
            </button>
          </div>
        </form>
      </section>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-5">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="max-w-[75%] truncate rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-600">
              문제 원본 {typedNote.source_file_url ? `· ${typedNote.source_file_url.split("/").pop()?.replace(/^[^-]+-/, "")}` : ""}
            </span>
          </div>
          {problemFileUrl ? (
            <FilePreview url={problemFileUrl} path={typedNote.source_file_url} alt="업로드한 문제 원본" />
          ) : (
            <div className="rounded-2xl bg-slate-50 p-6">
              <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{typedNote.question}</p>
            </div>
          )}
        </section>

        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-8">
          <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-600">문제 인식 완료</span>
          <h1 className="mt-4 break-words text-xl font-bold leading-snug text-slate-900 sm:text-3xl">
            {details?.title || typedNote.question}
          </h1>
          {details && (
            <div className="mt-4 flex flex-wrap gap-2">
              {details.gradeLevel && <span className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600">{details.gradeLevel}</span>}
              {details.curriculum && <span className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600">{details.curriculum}</span>}
              {details.difficulty && <span className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600">난이도 {details.difficulty}</span>}
            </div>
          )}

          <div className="mt-7 rounded-2xl bg-slate-50 p-5">
            <p className="text-xs font-bold text-slate-500">인식한 문제의 핵심</p>
            <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-800">{typedNote.question}</p>
          </div>

          {details && (
            <div className="mt-5 overflow-hidden rounded-2xl bg-slate-900 px-4 py-4 text-white sm:px-5">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="text-slate-400">분석 순서</span>
                <span>{details.questionType || "문제 유형 파악"}</span>
                <span className="text-indigo-300">→</span>
                <span>{details.coreConcepts[0] || "핵심 개념 연결"}</span>
                <span className="text-indigo-300">→</span>
                <span>단계별 풀이</span>
              </div>
            </div>
          )}
        </section>
      </div>

      {details?.solutionSteps.length ? (
        <section className="w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-indigo-600">단계별 풀이</p>
              <h2 className="mt-3 break-keep text-xl font-bold sm:text-2xl">풀이 흐름을 순서대로 따라가 보세요</h2>
            </div>
            {details.answerSummary && (
              <span className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-600">
                정답 · {details.answerSummary}
              </span>
            )}
          </div>

          <div className="mt-6 divide-y divide-slate-100">
            {details.solutionSteps.map((step, index) => (
              <div key={`${step.title}-${index}`} className="grid gap-4 py-5 sm:grid-cols-[44px_1fr]">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-sm font-bold text-indigo-600">{index + 1}</span>
                <div>
                  <p className="text-xs font-bold text-indigo-500">{step.title}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-800">{step.explanation}</p>
                  {step.formula && <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">{step.formula}</p>}
                </div>
              </div>
            ))}
          </div>

          {details.answerSummary && (
            <div className="mt-2 flex items-center gap-4 rounded-2xl bg-emerald-50 p-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-500 font-bold text-white">✓</span>
              <div>
                <p className="text-xs font-bold text-emerald-600">풀이 결론</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{details.answerSummary}</p>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {details?.confusionPoints.length ? (
        <section className="w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-8">
          <p className="text-sm font-bold text-indigo-600">예상 혼동 지점</p>
          <h2 className="mt-3 break-keep text-xl font-bold sm:text-2xl">이 부분을 다시 확인해 보세요</h2>
          {!typedNote.student_solution_file_url && !typedNote.my_answer && (
            <div className="mt-6 rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-800">
              <strong>아직 학생 풀이가 없어요.</strong>
              <p className="mt-1 text-xs leading-5">아래 내용은 이 문제에서 자주 헷갈리는 지점입니다. 다음 분석 때 학생 풀이도 함께 올리면 실제 오류 원인을 더 정확히 찾을 수 있어요.</p>
            </div>
          )}
          <div className="mt-5 space-y-4">
            {details.confusionPoints.map((point, index) => (
              <div key={`${point.title}-${index}`} className="grid gap-3 sm:grid-cols-[34px_1fr]">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-rose-50 text-xs font-bold text-rose-500">{index + 1}</span>
                <div>
                  <p className="text-sm font-bold text-slate-800">{point.title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">{point.explanation}</p>
                  {point.correction && <p className="mt-1 text-sm font-semibold text-indigo-600">다음에는: {point.correction}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : typedNote.ai_analysis ? (
        <section className="rounded-3xl border border-indigo-100 bg-indigo-50 p-6">
          <h2 className="text-sm font-bold text-indigo-700">AI 오답 분석 {typedNote.mistake_type && `· ${typedNote.mistake_type}`}</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-indigo-950">{typedNote.ai_analysis}</p>
        </section>
      ) : null}

      <section className="w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-8">
        <p className="text-sm font-bold text-indigo-600">나의 오답 기록</p>
        <h2 className="mt-3 text-xl font-bold sm:text-2xl">내가 틀린 이유</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          AI가 찾은 예상 혼동 지점을 참고해서, 실제로 내가 왜 틀렸는지 직접 적어보세요.
        </p>
        <form
          id="mistake-reason-form"
          action={updateNoteMistakeReason}
          className="mt-5"
        >
          <input type="hidden" name="id" value={typedNote.id} />
          <textarea
            name="userMistakeReason"
            defaultValue={typedNote.user_mistake_reason ?? ""}
            maxLength={2000}
            rows={5}
            placeholder="예: 지문의 핵심어인 noise만 보고 세부 내용 문제라고 생각했다. 다음에는 각 문단의 공통 내용을 먼저 정리하겠다."
            className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-7 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50"
          />
          <p className="mt-2 text-right text-xs text-slate-400">최대 2,000자 · 상단 저장 버튼으로 저장</p>
        </form>
      </section>

      {(solutionFileUrl || typedNote.my_answer) && (
        <section className="w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-8">
          <p className="text-sm font-bold text-indigo-600">학생 풀이</p>
          <h2 className="mt-3 text-xl font-bold">내가 풀었던 과정을 함께 확인해요</h2>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {solutionFileUrl && (
              <FilePreview
                url={solutionFileUrl}
                path={typedNote.student_solution_file_url}
                alt="학생 풀이 원본"
              />
            )}
            {typedNote.my_answer && (
              <div className="rounded-2xl bg-slate-50 p-5">
                <p className="text-xs font-bold text-slate-500">내가 쓴 답</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{typedNote.my_answer}</p>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm sm:p-5">
        <span className="text-slate-500">복습 단계 · Box {typedNote.box_level} / 5</span>
        {typedNote.mastered ? (
          <span className="font-bold text-emerald-600">완전 학습 완료</span>
        ) : (
          <span className="text-slate-500">다음 복습 · {new Date(typedNote.next_review_at).toLocaleDateString("ko-KR")}</span>
        )}
      </section>
    </div>
  );
}
