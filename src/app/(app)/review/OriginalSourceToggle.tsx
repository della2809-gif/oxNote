"use client";

import { useId, useState } from "react";

type SourceResponse = {
  url?: string;
  type?: "image" | "pdf";
  error?: string;
};

export default function OriginalSourceToggle({ noteId }: { noteId: string }) {
  const panelId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [source, setSource] = useState<{ url: string; type: "image" | "pdf" } | null>(null);
  const [error, setError] = useState("");

  async function toggle() {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    setIsOpen(true);
    if (source || isLoading) return;

    setIsLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/notes/${encodeURIComponent(noteId)}/source`, {
        cache: "no-store",
      });
      const result = (await response.json()) as SourceResponse;
      if (!response.ok || !result.url || !result.type) {
        throw new Error(result.error || "원본 파일을 불러오지 못했습니다.");
      }
      setSource({ url: result.url, type: result.type });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "원본 파일을 불러오지 못했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mt-3 rounded-md border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="font-medium text-indigo-600 hover:text-indigo-700"
      >
        {isOpen ? "원본 닫기" : "추출 내용이 이상한가요? 원본 보기"}
      </button>

      {isOpen && (
        <div id={panelId} className="mt-3">
          {isLoading && <p className="text-neutral-500">원본을 불러오는 중입니다...</p>}
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-red-600">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => {
                  setSource(null);
                  setIsOpen(false);
                  setError("");
                }}
                className="mt-2 font-semibold underline"
              >
                다시 시도
              </button>
            </div>
          )}
          {source?.type === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={source.url}
              alt="업로드한 문제 원본"
              loading="lazy"
              decoding="async"
              className="max-h-[70vh] h-auto w-full rounded-lg border border-neutral-200 bg-white object-contain dark:border-neutral-700"
            />
          )}
          {source?.type === "pdf" && (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg border border-indigo-200 bg-white px-4 py-3 text-center font-medium text-indigo-600 hover:bg-indigo-50"
            >
              원본 PDF 새 창에서 보기
            </a>
          )}
        </div>
      )}
    </div>
  );
}
