import Link from "next/link";
import { notFound } from "next/navigation";
import MathText from "@/components/MathText";
import QuestionWithVisuals from "@/components/QuestionWithVisuals";
import { createClient } from "@/lib/supabase/server";
import type { Note, NoteAiDetails, Subject } from "@/lib/types";
import {
  deleteNote,
  updateNoteExtractedContent,
  updateNoteMistakeReason,
} from "../actions";

// 보류 기능: 학습 분석 데이터와 화면 코드는 유지하되 운영 화면에서는 숨깁니다.
const SHOW_LEARNING_ANALYSIS = false;

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
    recognizedConditions: Array.isArray(details.recognizedConditions)
      ? details.recognizedConditions
      : [],
    learningElements: Array.isArray(details.learningElements)
      ? details.learningElements
      : [],
    gradeRationale: details.gradeRationale ?? "",
    difficultyRationale: details.difficultyRationale ?? "",
    solutionSteps: details.solutionSteps,
    answerSummary: details.answerSummary ?? "",
    confusionPoints: Array.isArray(details.confusionPoints) ? details.confusionPoints : [],
    userConfusionSelections: Array.isArray(details.userConfusionSelections) ? details.userConfusionSelections : [],
    mathVerification:
      details.mathVerification &&
      ["passed", "corrected", "needs_review", "not_applicable"].includes(
        details.mathVerification.status,
      )
        ? details.mathVerification
        : undefined,
    problemRegion: details.problemRegion,
    imageCleanup: details.imageCleanup,
    visualAssets: Array.isArray(details.visualAssets) ? details.visualAssets : [],
    documentRecognition: details.documentRecognition,
    inputArtifact: details.inputArtifact,
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

  const { data: note } = await supabase
    .from("notes")
    .select("id, user_id, subject_id, source, source_file_url, source_file_size_bytes, student_solution_file_url, student_solution_file_size_bytes, question, my_answer, correct_answer, ai_analysis, ai_details, user_mistake_reason, mistake_type, tags, box_level, next_review_at, mastered, created_at, updated_at")
    .eq("id", id)
    .single();
  if (!note) notFound();

  const typedNote = note as Note;
  const details = asDetails(typedNote.ai_details);
  let subject: Pick<Subject, "id" | "name" | "color"> | null = null;
  if (typedNote.subject_id) {
    const { data } = await supabase
      .from("subjects")
      .select("id, name, color")
      .eq("id", typedNote.subject_id)
      .single();
    subject = data;
  }

  const problemDisplayPath = details?.imageCleanup?.cleanedPath ?? typedNote.source_file_url;
  const [problemFileUrl, originalProblemFileUrl, solutionFileUrl] = await Promise.all([
    signedFileUrl(supabase, problemDisplayPath),
    details?.imageCleanup?.cleanedPath ? signedFileUrl(supabase, typedNote.source_file_url) : Promise.resolve(null),
    signedFileUrl(supabase, typedNote.student_solution_file_url),
  ]);
  const visualUrls = (await Promise.all(
    (details?.visualAssets ?? []).map(async (asset) => ({
      url: await signedFileUrl(supabase, asset.path),
      altText: asset.altText,
    })),
  )).filter((asset): asset is { url: string; altText: string } => Boolean(asset.url));
  const hasStudentSolution = Boolean(solutionFileUrl || typedNote.my_answer);

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

        {details?.documentRecognition?.needsReview && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-bold">⚠ 원본 확인이 필요한 부분이 있습니다.</p>
            <p className="mt-1 leading-6">
              1차 OCR 신뢰도 {Math.round(details.documentRecognition.confidence * 100)}% · 원본 이미지 재검증 적용
              {details.documentRecognition.warnings.length > 0
                ? ` · ${details.documentRecognition.warnings.slice(0, 2).join(" · ")}`
                : " · 아래 문제 전문을 원본과 비교하고 필요한 부분만 수정해 주세요."}
            </p>
          </div>
        )}

        <form action={updateNoteExtractedContent} className="mt-6 space-y-5">
          <input type="hidden" name="id" value={typedNote.id} />
          <div className="space-y-2 text-sm font-bold text-slate-700">
            <p>문제 전문</p>
            <div
              aria-label="수식이 적용된 문제 전문"
              className="whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-medium leading-8 text-slate-800"
            >
              <QuestionWithVisuals question={typedNote.question} visuals={visualUrls} />
            </div>
            <details className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <summary className="cursor-pointer text-xs font-bold text-indigo-600">
                인식된 문제 직접 수정하기
              </summary>
              <label className="mt-3 block">
                <span className="sr-only">문제 전문 편집</span>
                <textarea
                  name="question"
                  required
                  maxLength={12000}
                  rows={8}
                  defaultValue={typedNote.question}
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium leading-7 text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                />
              </label>
            </details>
          </div>

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
              문제 원본 {details?.imageCleanup?.cleanedPath ? "· 필기와 주변 영역을 정리한 이미지" : typedNote.source_file_url ? `· ${typedNote.source_file_url.split("/").pop()?.replace(/^[^-]+-/, "")}` : ""}
            </span>
            {originalProblemFileUrl && (
              <a href={originalProblemFileUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-slate-500 underline underline-offset-2">
                보정 전 원본 보기
              </a>
            )}
          </div>
          {problemFileUrl ? (
            <FilePreview url={problemFileUrl} path={problemDisplayPath} alt="정리된 문제 원본" />
          ) : (
            <div className="rounded-2xl bg-slate-50 p-6">
              <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700"><MathText>{typedNote.question}</MathText></p>
            </div>
          )}
        </section>

        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-8">
          <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-600">문제 인식 완료</span>
          <h1 className="mt-4 break-words text-xl font-bold leading-snug text-slate-900 sm:text-3xl">
            <MathText>{details?.title || typedNote.question}</MathText>
          </h1>
          {details?.curriculum && (
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600">{details.curriculum}</span>
            </div>
          )}

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

      <section className="w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-indigo-600">풀이 비교</p>
            <h2 className="mt-3 break-keep text-xl font-bold sm:text-2xl">학생 풀이와 정답 풀이를 함께 확인해요</h2>
          </div>
          <span className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
            정답 · <MathText>{details?.answerSummary || typedNote.correct_answer}</MathText>
          </span>
        </div>

        <div className="mt-6 grid gap-5">
          <article className="hidden min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5" aria-hidden="true">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-500">학생 풀이</p>
                <h3 className="mt-1 text-lg font-bold text-slate-900">내가 풀었던 과정</h3>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${hasStudentSolution ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-500"}`}>
                {hasStudentSolution ? "풀이 등록됨" : "풀이 없음"}
              </span>
            </div>

            <div className="mt-4 space-y-4">
              {solutionFileUrl && (
                <FilePreview
                  url={solutionFileUrl}
                  path={typedNote.student_solution_file_url}
                  alt="학생 풀이 원본"
                />
              )}
              {typedNote.my_answer && (
                <div className="rounded-xl bg-white p-4">
                  <p className="text-xs font-bold text-slate-500">내가 쓴 답</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{typedNote.my_answer}</p>
                </div>
              )}
              {!hasStudentSolution && (
                <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-slate-300 bg-white px-4 text-center text-sm text-slate-500">
                  다음 문제 분석 때 학생 풀이 사진이나 PDF를 함께 올리면 풀이 과정을 비교할 수 있어요.
                </div>
              )}
            </div>
          </article>

          <article className="min-w-0 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-emerald-600">정답 풀이</p>
                <h3 className="mt-1 text-lg font-bold text-slate-900">올바른 풀이 과정</h3>
              </div>
              {details?.mathVerification &&
                details.mathVerification.status !== "not_applicable" && (
                  <MathVerificationBadge verification={details.mathVerification} />
                )}
            </div>

            {details?.mathVerification?.status === "needs_review" && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-bold">계산기 검산에서 확인이 필요한 식을 찾았습니다.</p>
                {details.mathVerification.warnings.map((warning) => (
                  <p key={warning} className="mt-1 text-xs leading-5">· {warning}</p>
                ))}
              </div>
            )}

            {details?.mathVerification?.status === "corrected" &&
              details.mathVerification.corrections.length > 0 && (
                <details className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
                  <summary className="cursor-pointer font-bold">
                    자동 수정된 계산 {details.mathVerification.correctedCount}개 보기
                  </summary>
                  {details.mathVerification.corrections.map((correction) => (
                    <p key={correction} className="mt-2 text-xs leading-5">· {correction}</p>
                  ))}
                </details>
              )}

            {details?.solutionSteps.length ? (
              <div className="mt-4 divide-y divide-emerald-100">
                {details.solutionSteps.map((step, index) => (
                  <div key={`${step.title}-${index}`} className="grid gap-3 py-4 sm:grid-cols-[36px_1fr]">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500 text-xs font-bold text-white">{index + 1}</span>
                    <div>
                      <p className="text-xs font-bold text-emerald-700">{step.title}</p>
                      <p className="mt-1.5 text-sm font-semibold leading-6 text-slate-800"><MathText>{step.explanation}</MathText></p>
                      {step.formula && <p className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-white px-3 py-2 text-sm leading-7 text-slate-700"><MathText>{step.formula}</MathText></p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl bg-white p-4">
                <p className="text-xs font-bold text-emerald-700">정답</p>
                <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-800"><MathText>{typedNote.correct_answer}</MathText></p>
                {typedNote.ai_analysis && <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600"><MathText>{typedNote.ai_analysis}</MathText></p>}
              </div>
            )}

            <div className="mt-4 flex items-start gap-3 rounded-xl bg-emerald-100 p-4">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500 font-bold text-white">✓</span>
              <div>
                <p className="text-xs font-bold text-emerald-700">풀이 결론</p>
                <p className="mt-1 text-sm font-bold leading-6 text-slate-900"><MathText>{details?.answerSummary || typedNote.correct_answer}</MathText></p>
              </div>
            </div>
          </article>
        </div>
      </section>

      {details?.confusionPoints.length ? (
        <section className="w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-8">
          <p className="text-sm font-bold text-indigo-600">예상 혼동 지점</p>
          <h2 className="mt-3 break-keep text-xl font-bold sm:text-2xl">이 부분을 다시 확인해 보세요</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">실제로 혼동이 생긴 단계를 선택해 주세요. 선택 기록은 이후 실수 통계와 학습 리포트에 활용됩니다.</p>
          <div className="mt-5 space-y-4">
            {details.confusionPoints.map((point, index) => (
              <label key={`${point.title}-${index}`} className="grid cursor-pointer gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-indigo-300 hover:bg-indigo-50/40 sm:grid-cols-[34px_1fr_auto]">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-rose-50 text-xs font-bold text-rose-500">{index + 1}</span>
                <div>
                  <p className="text-sm font-bold text-slate-800"><MathText>{point.title}</MathText></p>
                  <p className="mt-1 text-sm leading-6 text-slate-500"><MathText>{point.explanation}</MathText></p>
                  {point.correction && <p className="mt-1 text-sm font-semibold text-indigo-600">다음에는: <MathText>{point.correction}</MathText></p>}
                </div>
                <input
                  type="checkbox"
                  form="mistake-reason-form"
                  name="confusionStage"
                  value={String(index)}
                  defaultChecked={details.userConfusionSelections?.some((selection) => selection.stageIndex === index)}
                  className="mt-1 h-6 w-6 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  aria-label={`${index + 1}단계 ${point.title}에서 혼동함`}
                />
              </label>
            ))}
          </div>
        </section>
      ) : typedNote.ai_analysis ? (
        <section className="rounded-3xl border border-indigo-100 bg-indigo-50 p-6">
          <h2 className="text-sm font-bold text-indigo-700">AI 오답 분석 {typedNote.mistake_type && `· ${typedNote.mistake_type}`}</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-indigo-950"><MathText>{typedNote.ai_analysis}</MathText></p>
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
          <p className="mt-2 text-right text-xs text-slate-400">최대 2,000자 · 상단 또는 하단 저장 버튼으로 저장</p>
        </form>
      </section>

      {SHOW_LEARNING_ANALYSIS && details &&
        ((details.learningElements?.length ?? 0) > 0 ||
          details.difficultyRationale) && (
          <section className="w-full min-w-0 overflow-hidden rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-8">
            <p className="text-sm font-bold text-indigo-600">GPT 학습 분석</p>
            <h2 className="mt-3 break-keep text-xl font-bold sm:text-2xl">
              이 문제에 필요한 개념과 학습 수준
            </h2>

            {details.learningElements?.length ? (
              <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {details.learningElements.map((element, index) => (
                  <article key={`${element.concept}-${index}`} className="rounded-2xl bg-indigo-50/70 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-slate-900"><MathText>{element.concept}</MathText></h3>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600"><MathText>{element.explanation}</MathText></p>
                  </article>
                ))}
              </div>
            ) : null}

            <div className="mt-5 grid gap-3">
              {details.difficultyRationale && (
                <article className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                  <p className="text-xs font-bold text-slate-500">난이도 판단 근거</p>
                  <p className="mt-2 text-sm leading-7 text-slate-700"><MathText>{details.difficultyRationale}</MathText></p>
                </article>
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

      <div className="flex w-full justify-end pb-2">
        <button
          type="submit"
          form="mistake-reason-form"
          className="min-h-12 w-full rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-100 transition hover:bg-indigo-700 sm:w-auto sm:min-w-28"
        >
          저장
        </button>
      </div>
    </div>
  );
}

function MathVerificationBadge({
  verification,
}: {
  verification: NonNullable<NoteAiDetails["mathVerification"]>;
}) {
  const config = {
    passed: {
      label: `계산기 검산 완료 · ${verification.checkedCount}개`,
      className: "bg-emerald-100 text-emerald-700",
    },
    corrected: {
      label: `계산 오류 자동 수정 · ${verification.correctedCount}개`,
      className: "bg-sky-100 text-sky-700",
    },
    needs_review: {
      label: "계산 검토 필요",
      className: "bg-amber-100 text-amber-800",
    },
    not_applicable: {
      label: "",
      className: "",
    },
  }[verification.status];

  return (
    <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${config.className}`}>
      {config.label}
    </span>
  );
}
