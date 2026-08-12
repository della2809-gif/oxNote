"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { HandwritingArtifact, Subject } from "@/lib/types";
import { createNote, createNoteFromFile } from "../actions";
import { createSubjectInline } from "../../subjects/actions";
import ImageCropper, { compressImageFile } from "./ImageCropper";
import HandwritingCanvas from "./HandwritingCanvas";

const fieldClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50";
const SAFE_UPLOAD_BYTES = 30 * 1024 * 1024;

type FileSelection = {
  file: File;
  previewUrl: string | null;
};

type AnalysisPreview = {
  question?: string;
  correctAnswer?: string;
  analysis?: string;
  answerSummary?: string;
};

type NoteStreamEvent = {
  type: "progress" | "complete" | "error";
  message?: string;
  preview?: AnalysisPreview;
  noteId?: string;
  error?: string;
};

function makeSelection(file: File | null): FileSelection | null {
  if (!file) return null;
  return {
    file,
    previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
  };
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden="true">
      <path d="M12 16V4m0 0 4.5 4.5M12 4 7.5 8.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <path
        d="M8.5 6.5 10 4h4l1.5 2.5H18A2.5 2.5 0 0 1 20.5 9v8A2.5 2.5 0 0 1 18 19.5H6A2.5 2.5 0 0 1 3.5 17V9A2.5 2.5 0 0 1 6 6.5h2.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden="true">
      <path d="m7 12 3 1 1 3 1-3 3-1-3-1-1-3-1 3-3 1Zm8-6 1.5.5L17 8l.5-1.5L19 6l-1.5-.5L17 4l-.5 1.5L15 6Z" fill="currentColor" />
    </svg>
  );
}

function SubmitButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={!ready || pending}
      className="w-full rounded-xl bg-indigo-600 px-5 py-4 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
    >
      {pending ? "문제 유형과 풀이를 분석하고 있어요..." : "문제 유형과 풀이 분석하기 →"}
    </button>
  );
}

function StreamingSubmitButton({ ready, pending }: { ready: boolean; pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={!ready || pending}
      className="w-full rounded-xl bg-indigo-600 px-5 py-4 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
    >
      {pending ? "AI 분석을 진행하고 있어요..." : "문제 유형과 풀이 분석하기 →"}
    </button>
  );
}

export default function NoteForm({
  subjects,
  error,
}: {
  subjects: Subject[];
  error?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"file" | "manual" | "pen">("file");
  const [problem, setProblem] = useState<FileSelection | null>(null);
  const [solution, setSolution] = useState<FileSelection | null>(null);
  const [subjectOptions, setSubjectOptions] = useState(subjects);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [cropSource, setCropSource] = useState<File | null>(null);
  const [clientError, setClientError] = useState("");
  const [isProcessingSolution, setIsProcessingSolution] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const [analysisPreview, setAnalysisPreview] = useState<AnalysisPreview>({});
  const [handwritingArtifact, setHandwritingArtifact] = useState<HandwritingArtifact | null>(null);
  const [recognizedQuestion, setRecognizedQuestion] = useState("");
  const [recognizedLatex, setRecognizedLatex] = useState("");
  const fileFormRef = useRef<HTMLFormElement>(null);
  const problemInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const solutionInputRef = useRef<HTMLInputElement>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const url = problem?.previewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [problem?.previewUrl]);

  useEffect(() => {
    const url = solution?.previewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [solution?.previewUrl]);

  useEffect(() => {
    return () => requestControllerRef.current?.abort();
  }, []);

  function replaceSelection(
    nextFile: File | null,
    current: FileSelection | null,
    setter: (value: FileSelection | null) => void,
  ) {
    if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
    setter(makeSelection(nextFile));
  }

  function setCanonicalProblemFile(file: File) {
    if (!problemInputRef.current) return false;
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      problemInputRef.current.files = transfer.files;
      if (problemInputRef.current.files?.[0] !== file) return false;
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      replaceSelection(file, problem, setProblem);
      setClientError("");
      return true;
    } catch {
      return false;
    }
  }

  function chooseProblemFile(file: File | null) {
    if (!file) return;
    setClientError("");
    if (file.type.startsWith("image/")) {
      setCropSource(file);
      return;
    }
    setCanonicalProblemFile(file);
  }

  async function submitFileAnalysis(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAnalyzing || requestControllerRef.current) return;
    const totalBytes = (problem?.file.size ?? 0) + (solution?.file.size ?? 0);
    if (totalBytes > SAFE_UPLOAD_BYTES) {
      setClientError("파일이 너무 큽니다. PDF 용량을 줄이거나 학생 풀이 파일을 제외하고 다시 시도해 주세요.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestId = crypto.randomUUID();
    const formData = new FormData(event.currentTarget);
    formData.set("requestId", requestId);
    setClientError("");
    setAnalysisPreview({});
    setProgressMessage("요청을 전송하고 있어요.");
    setIsAnalyzing(true);

    try {
      const response = await fetch("/api/notes/create", {
        method: "POST",
        body: formData,
        signal: controller.signal,
        headers: { "X-Request-Id": requestId },
      });
      if (response.status === 401) {
        router.push("/login?next=/notes/new");
        return;
      }
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? "AI 분석 요청을 시작하지 못했습니다.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      let completedNoteId = "";
      while (true) {
        const { value, done } = await reader.read();
        buffered += decoder.decode(value, { stream: !done });
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const streamEvent = JSON.parse(line) as NoteStreamEvent;
          if (streamEvent.type === "error") throw new Error(streamEvent.error ?? "AI 분석에 실패했습니다.");
          if (streamEvent.message) setProgressMessage(streamEvent.message);
          if (streamEvent.preview) {
            setAnalysisPreview((current) => ({ ...current, ...streamEvent.preview }));
          }
          if (streamEvent.type === "complete" && streamEvent.noteId) completedNoteId = streamEvent.noteId;
        }
        if (done) break;
      }
      if (!completedNoteId) throw new Error("분석은 끝났지만 저장 결과를 확인하지 못했습니다.");
      setProgressMessage("저장이 완료되었어요. 오답노트로 이동합니다.");
      router.push(`/notes/${completedNoteId}`);
      router.refresh();
    } catch (submissionError) {
      if (controller.signal.aborted) {
        setClientError("AI 분석 요청을 취소했습니다.");
      } else {
        setClientError(submissionError instanceof Error ? submissionError.message : "AI 분석에 실패했습니다.");
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      if (requestControllerRef.current === controller) requestControllerRef.current = null;
      setIsAnalyzing(false);
    }
  }

  if (mode === "manual") {
    return (
      <div className="mx-auto max-w-3xl">
        <InputModeTabs mode={mode} onChange={setMode} />
        <form action={createNote} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div>
            <h2 className="text-xl font-bold text-slate-900">문제 직접 입력</h2>
            <p className="mt-1 text-sm text-slate-500">파일이 없을 때 문제와 답을 입력해 오답노트를 만들 수 있어요.</p>
          </div>
          <SubjectSelect
            subjects={subjectOptions}
            selectedSubjectId={selectedSubjectId}
            onSelect={setSelectedSubjectId}
            onCreated={(subject) => {
              setSubjectOptions((current) =>
                current.some((item) => item.id === subject.id)
                  ? current
                  : [...current, subject].sort((a, b) => a.name.localeCompare(b.name, "ko")),
              );
              setSelectedSubjectId(subject.id);
            }}
          />
          <label className="block space-y-2 text-sm font-semibold text-slate-700">
            <span>출처 <span className="font-normal text-slate-400">(선택)</span></span>
            <input name="source" className={fieldClass} placeholder="예: 2026년 1학기 중간고사" />
          </label>
          <label className="block space-y-2 text-sm font-semibold text-slate-700">
            <span>문제</span>
            <textarea name="question" required rows={5} className={fieldClass} />
          </label>
          <label className="block space-y-2 text-sm font-semibold text-slate-700">
            <span>내가 선택한 답</span>
            <textarea name="myAnswer" required rows={3} className={fieldClass} placeholder="예: ② 또는 내가 작성한 답" />
          </label>
          <label className="block space-y-2 text-sm font-semibold text-slate-700">
            <span>정답</span>
            <textarea name="correctAnswer" required rows={3} className={fieldClass} placeholder="예: ③ 또는 정답 내용" />
          </label>
          <LearningStatusField />
          <SubmitButton ready />
        </form>
      </div>
    );
  }

  return (
    <>
    <form
      ref={fileFormRef}
      action={createNoteFromFile}
      className="space-y-5"
      onSubmit={submitFileAnalysis}
    >
      <input
        type="hidden"
        name="subjectName"
        value={subjectOptions.find((subject) => subject.id === selectedSubjectId)?.name ?? ""}
      />
      <input type="hidden" name="inputMode" value={mode === "pen" ? "handwriting" : "file"} />
      <input type="hidden" name="handwritingStrokes" value={handwritingArtifact ? JSON.stringify(handwritingArtifact) : ""} />
      <input type="hidden" name="recognizedQuestionHint" value={recognizedQuestion} />
      <input type="hidden" name="recognizedLatex" value={recognizedLatex} />
      <input
        ref={problemInputRef}
        id="problem-file"
        type="file"
        name="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={(event) => {
          if (cameraInputRef.current) cameraInputRef.current.value = "";
          chooseProblemFile(event.target.files?.[0] ?? null);
        }}
        className="sr-only"
      />
      <input
        ref={cameraInputRef}
        id="problem-camera"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          if (problemInputRef.current) problemInputRef.current.value = "";
          chooseProblemFile(event.target.files?.[0] ?? null);
        }}
        className="sr-only"
      />
      <InputModeTabs mode={mode} onChange={(nextMode) => {
        setMode(nextMode);
        setClientError("");
      }} />
      {(error || clientError) && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-medium text-red-600">
          {clientError || error}
        </div>
      )}

      {isAnalyzing && (
        <section aria-live="polite" className="rounded-3xl border border-indigo-100 bg-indigo-50 p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-500">AI 실시간 분석</p>
              <p className="mt-1 text-base font-bold text-slate-900">{progressMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => requestControllerRef.current?.abort()}
              className="shrink-0 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-100"
            >
              취소
            </button>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-indigo-100">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-indigo-500" />
          </div>
          {(analysisPreview.question || analysisPreview.correctAnswer || analysisPreview.analysis || analysisPreview.answerSummary) && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {analysisPreview.question && (
                <div className="rounded-2xl bg-white p-4 sm:col-span-2">
                  <p className="text-xs font-bold text-indigo-500">인식한 문제</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{analysisPreview.question}</p>
                </div>
              )}
              {analysisPreview.correctAnswer && (
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-xs font-bold text-emerald-600">정답</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{analysisPreview.correctAnswer}</p>
                </div>
              )}
              {(analysisPreview.answerSummary || analysisPreview.analysis) && (
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-xs font-bold text-indigo-500">핵심 풀이</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {analysisPreview.answerSummary || analysisPreview.analysis}
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:p-5">
        <div className="flex items-center gap-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600 text-sm font-bold text-white">1</span>
          <div>
            <p className="text-sm font-bold text-slate-900">문제를 촬영하거나 사진 또는 PDF를 올려주세요</p>
            <p className="mt-1 text-xs text-slate-400">JPG·PNG·WEBP·PDF · 파일당 최대 15MB</p>
          </div>
        </div>
        <span className="hidden text-xl font-light text-slate-300 sm:block">＋</span>
        <div className="flex items-center gap-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-sm font-bold text-slate-500">2</span>
          <div>
            <p className="text-sm font-bold text-slate-900">학생 풀이를 추가하면 더 정확해요</p>
            <p className="mt-1 text-xs text-slate-400">실제로 막힌 단계와 오류 지점까지 분석</p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          {mode === "pen" ? (
            <HandwritingCanvas
              onError={setClientError}
              onReady={(payload) => {
                if (!payload) {
                  setHandwritingArtifact(null);
                  setRecognizedQuestion("");
                  setRecognizedLatex("");
                  if (problemInputRef.current) problemInputRef.current.value = "";
                  replaceSelection(null, problem, setProblem);
                  return;
                }
                if (!setCanonicalProblemFile(payload.file)) {
                  setClientError("이 브라우저에서는 손글씨 이미지를 첨부할 수 없습니다. 브라우저를 업데이트해 주세요.");
                  return;
                }
                setHandwritingArtifact(payload.artifact);
                setRecognizedQuestion(payload.recognizedText);
                setRecognizedLatex(payload.recognizedLatex);
              }}
              onSolve={() => fileFormRef.current?.requestSubmit()}
            />
          ) : (
          <div
            className="flex min-h-[320px] flex-col overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 sm:min-h-[410px]"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const dropped = event.dataTransfer.files?.[0] ?? null;
              chooseProblemFile(dropped);
            }}
          >
            {problem ? (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
                  <span className="truncate rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-600">
                    문제 사진 · {problem.file.name}
                  </span>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setCropSource(problem.file)}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                    >
                      문제 영역 다시 자르기
                    </button>
                    <button
                      type="button"
                      onClick={() => problemInputRef.current?.click()}
                      className="text-xs font-semibold text-slate-500 hover:text-indigo-700"
                    >
                      다른 파일
                    </button>
                  </div>
                </div>
                <div className="grid flex-1 place-items-center p-4">
                  {problem.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={problem.previewUrl}
                      alt="선택한 문제 미리보기"
                      className="max-h-[330px] w-full rounded-xl object-contain"
                    />
                  ) : (
                    <div className="text-center">
                      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-indigo-100 text-indigo-600">
                        <span className="text-sm font-bold">PDF</span>
                      </div>
                      <p className="mt-4 max-w-xs break-all text-sm font-semibold text-slate-700">{problem.file.name}</p>
                      <p className="mt-1 text-xs text-slate-400">AI가 PDF의 문제를 읽어 분석합니다.</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center p-8 text-center">
                <span>
                  <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-indigo-100 text-indigo-600">
                    <UploadIcon />
                  </span>
                  <strong className="mt-5 block text-lg text-slate-900">문제를 촬영하거나 파일로 올리기</strong>
                  <span className="mt-2 block text-sm leading-6 text-slate-500">
                    카메라로 바로 찍거나 기존 사진·PDF를 선택하세요.
                  </span>
                  <span className="mt-5 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-indigo-700"
                    >
                      <CameraIcon />
                      카메라로 촬영
                    </button>
                    <button
                      type="button"
                      onClick={() => problemInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-5 py-3 text-sm font-bold text-indigo-600 hover:bg-indigo-50"
                    >
                      <UploadIcon />
                      사진·PDF 선택
                    </button>
                  </span>
                  <span className="mt-3 block text-xs text-slate-400">
                    PC에서는 파일을 이곳에 끌어다 놓아도 됩니다.
                  </span>
                </span>
              </div>
            )}
          </div>
          )}

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-800">학생 풀이 사진·PDF</p>
                <p className="mt-1 text-xs text-slate-400">선택 사항 · 실제 오답 지점을 더 정확하게 찾습니다.</p>
              </div>
              <button
                type="button"
                onClick={() => solutionInputRef.current?.click()}
                className="shrink-0 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-50"
              >
                {solution ? "다시 선택" : "+ 풀이 추가"}
              </button>
            </div>
            <input
              ref={solutionInputRef}
              type="file"
              name="solutionFile"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={async (event) => {
                const selected = event.target.files?.[0] ?? null;
                if (!selected) return;
                if (!selected.type.startsWith("image/")) {
                  replaceSelection(selected, solution, setSolution);
                  return;
                }
                setIsProcessingSolution(true);
                setClientError("");
                try {
                  const compressed = await compressImageFile(selected);
                  const transfer = new DataTransfer();
                  transfer.items.add(compressed);
                  event.target.files = transfer.files;
                  replaceSelection(compressed, solution, setSolution);
                } catch {
                  event.target.value = "";
                  setClientError("학생 풀이 사진을 처리하지 못했습니다. JPG 또는 PNG 사진을 선택해 주세요.");
                } finally {
                  setIsProcessingSolution(false);
                }
              }}
              className="sr-only"
            />
            {isProcessingSolution && (
              <p className="mt-3 text-xs font-semibold text-indigo-600">
                학생 풀이 사진을 업로드에 맞게 줄이는 중입니다.
              </p>
            )}
            {solution && (
              <div className="mt-3 flex items-center gap-3 rounded-xl bg-white px-3 py-3 text-xs text-slate-600">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 font-bold text-emerald-600">✓</span>
                <span className="min-w-0 flex-1 truncate">{solution.file.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    if (solutionInputRef.current) solutionInputRef.current.value = "";
                    replaceSelection(null, solution, setSolution);
                  }}
                  className="font-semibold text-slate-400 hover:text-red-500"
                >
                  삭제
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-[420px] flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:min-h-[560px] sm:p-8">
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
              <SparkIcon />
            </span>
            <h2 className="mt-5 text-xl font-bold text-slate-900">
              {problem ? "분석할 준비가 되었어요" : "문제 사진을 분석해 볼까요?"}
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-6 text-slate-500">
              문제 유형, 관련 교육과정, 난이도, 단계별 풀이와 헷갈리기 쉬운 지점을 한 번에 정리해 드려요.
            </p>

            <div className="mt-7 grid w-full gap-3 text-left sm:grid-cols-2">
              <SubjectSelect
                subjects={subjectOptions}
                selectedSubjectId={selectedSubjectId}
                onSelect={setSelectedSubjectId}
                onCreated={(subject) => {
                  setSubjectOptions((current) =>
                    current.some((item) => item.id === subject.id)
                      ? current
                      : [...current, subject].sort((a, b) => a.name.localeCompare(b.name, "ko")),
                  );
                  setSelectedSubjectId(subject.id);
                }}
              />
              <label className="block space-y-2 text-xs font-bold text-slate-600">
                <span>시험·교재 출처 <span className="font-normal text-slate-400">(선택)</span></span>
                <input name="source" className={fieldClass} placeholder="예: 중2 수학 중간고사" />
              </label>
            </div>

            <div className="mt-4 grid w-full gap-3 text-left sm:grid-cols-2">
              <label className="block space-y-2 text-xs font-bold text-slate-600">
                <span>내가 선택한 답 <span className="text-red-500">*</span></span>
                <input name="myAnswerHint" required className={fieldClass} placeholder="예: ② 또는 내가 작성한 답" />
              </label>
              <label className="block space-y-2 text-xs font-bold text-slate-600">
                <span>정답 <span className="text-red-500">*</span></span>
                <input name="correctAnswerHint" required className={fieldClass} placeholder="예: ③ 또는 정답 내용" />
              </label>
            </div>
            <div className="mt-4 w-full text-left">
              <LearningStatusField />
            </div>
          </div>

          <div className="mt-7 space-y-4">
            {mode === "file" ? (
              <StreamingSubmitButton
                ready={Boolean(problem) && !cropSource && !isProcessingSolution}
                pending={isAnalyzing}
              />
            ) : (
              <p className="text-center text-xs leading-5 text-slate-400">손글씨 인식 결과를 확인한 뒤 ‘문제 풀기’를 눌러주세요.</p>
            )}
          </div>
        </section>
      </div>
    </form>
    {cropSource && (
      <ImageCropper
        file={cropSource}
        onCancel={() => {
          setCropSource(null);
          if (cameraInputRef.current) cameraInputRef.current.value = "";
          window.setTimeout(() => cameraInputRef.current?.click(), 0);
        }}
        onComplete={(croppedFile) => {
          if (!setCanonicalProblemFile(croppedFile)) {
            setClientError(
              "이 브라우저에서는 편집한 사진을 첨부할 수 없습니다. 브라우저를 업데이트한 뒤 다시 시도해 주세요.",
            );
          }
          setCropSource(null);
        }}
      />
    )}
    </>
  );
}

function InputModeTabs({
  mode,
  onChange,
}: {
  mode: "file" | "manual" | "pen";
  onChange: (mode: "file" | "manual" | "pen") => void;
}) {
  const tabs: Array<{ id: "file" | "manual" | "pen"; label: string }> = [
    { id: "manual", label: "키보드" },
    { id: "pen", label: "펜" },
    { id: "file", label: "사진" },
  ];
  return (
    <div className="mb-5 grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" role="tablist" aria-label="문제 입력 방식">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={mode === tab.id}
          onClick={() => onChange(tab.id)}
          className={`min-h-12 rounded-xl px-4 py-3 text-sm font-bold transition ${mode === tab.id ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-indigo-600"}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function LearningStatusField() {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-slate-700">
        문제 상태 <span className="text-red-500">*</span>
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50 has-[:checked]:text-indigo-700">
          <input type="radio" name="learningStatus" value="incorrect" required defaultChecked />
          틀린 문제
        </label>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50 has-[:checked]:text-indigo-700">
          <input type="radio" name="learningStatus" value="correct_review" required />
          맞았지만 복습
        </label>
      </div>
    </fieldset>
  );
}

function SubjectSelect({
  subjects,
  selectedSubjectId,
  onSelect,
  onCreated,
}: {
  subjects: Subject[];
  selectedSubjectId: string;
  onSelect: (id: string) => void;
  onCreated: (subject: Subject) => void;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [addError, setAddError] = useState("");
  const [isPending, startTransition] = useTransition();

  function addSubject() {
    startTransition(async () => {
      const result = await createSubjectInline(newSubjectName);
      if (!result.subject) {
        setAddError(result.error ?? "과목을 추가하지 못했습니다.");
        return;
      }
      onCreated(result.subject);
      setNewSubjectName("");
      setAddError("");
      setIsAdding(false);
    });
  }

  return (
    <div className="space-y-2 text-xs font-bold text-slate-600">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="note-subject">과목</label>
        <button
          type="button"
          onClick={() => {
            setIsAdding((current) => !current);
            setAddError("");
          }}
          className="font-bold text-indigo-600 hover:text-indigo-700"
        >
          {isAdding ? "취소" : "+ 과목 추가"}
        </button>
      </div>
      <select
        id="note-subject"
        name="subjectId"
        value={selectedSubjectId}
        onChange={(event) => onSelect(event.target.value)}
        className={fieldClass}
      >
        <option value="">AI가 자동 분류</option>
        {subjects.map((subject) => (
          <option key={subject.id} value={subject.id}>
            {subject.name}
          </option>
        ))}
      </select>
      {isAdding && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
          <div className="flex gap-2">
            <input
              value={newSubjectName}
              onChange={(event) => setNewSubjectName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (newSubjectName.trim() && !isPending) addSubject();
                }
              }}
              maxLength={40}
              placeholder="예: 과학, 토익, 공인중개사"
              className="min-w-0 flex-1 rounded-lg border border-indigo-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-indigo-400"
            />
            <button
              type="button"
              onClick={addSubject}
              disabled={!newSubjectName.trim() || isPending}
              className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2.5 text-xs font-bold text-white disabled:bg-slate-300"
            >
              {isPending ? "추가 중" : "추가"}
            </button>
          </div>
          {addError && <p className="mt-2 text-xs font-medium text-red-500">{addError}</p>}
        </div>
      )}
    </div>
  );
}
