import { revalidatePath } from "next/cache";
import { createAiPerformanceTracker } from "@/lib/ai-performance";
import {
  createFileNote,
  FileNoteCreationError,
  type FileNoteProgress,
} from "@/lib/create-file-note";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

type StreamEvent =
  | ({ type: "progress" } & FileNoteProgress)
  | { type: "complete"; noteId: string; cacheHit: boolean; performance: unknown }
  | { type: "error"; error: string; status: number };

function isTrustedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    if (originUrl.origin === requestUrl.origin) return true;

    const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
    return process.env.NODE_ENV !== "production"
      && localHosts.has(originUrl.hostname)
      && localHosts.has(requestUrl.hostname)
      && originUrl.protocol === requestUrl.protocol
      && originUrl.port === requestUrl.port;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id")?.slice(0, 120) || crypto.randomUUID();
  const perf = createAiPerformanceTracker(requestId, { flow: "file_note_route" });
  if (!isTrustedOrigin(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처입니다." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    return Response.json({ error: "multipart/form-data is required" }, { status: 415 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  perf.mark("auth", { authenticated: Boolean(user) });
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const formDataStartedAt = performance.now();
  const formData = await request.formData();
  perf.measure("form_data", formDataStartedAt);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: StreamEvent) => {
        if (closed || request.signal.aborted) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      void (async () => {
        try {
          const result = await createFileNote({
            supabase,
            user,
            formData,
            requestId,
            signal: request.signal,
            onProgress(progress) {
              send({ type: "progress", ...progress });
            },
          });
          revalidatePath("/notes");
          revalidatePath("/dashboard");
          send({ type: "complete", ...result });
        } catch (error) {
          const aborted = request.signal.aborted || (error instanceof Error && error.name === "AbortError");
          const status = error instanceof FileNoteCreationError ? error.status : aborted ? 499 : 500;
          const message = error instanceof FileNoteCreationError
            ? error.message
            : aborted
              ? "요청을 취소했습니다."
              : "AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
          console.error(`[PERF] ${requestId} failed`, error);
          send({ type: "error", error: message, status });
        } finally {
          perf.finish({ aborted: request.signal.aborted });
          close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
      "X-Request-Id": requestId,
    },
  });
}
