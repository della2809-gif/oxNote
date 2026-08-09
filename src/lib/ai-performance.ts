import "server-only";

type PerfValue = string | number | boolean | null | undefined;

export type AiPerfSummary = {
  requestId: string;
  totalMs: number;
  stages: Record<string, number>;
};

export function createAiPerformanceTracker(
  requestId = crypto.randomUUID(),
  context: Record<string, PerfValue> = {},
) {
  const startedAt = performance.now();
  let lastMarkAt = startedAt;
  const stages: Record<string, number> = {};

  function log(stage: string, elapsedMs: number, metadata?: Record<string, PerfValue>) {
    console.info(
      `[PERF] ${requestId} ${stage}: ${Math.round(elapsedMs)}ms`,
      JSON.stringify({ ...context, ...metadata }),
    );
  }

  return {
    requestId,
    mark(stage: string, metadata?: Record<string, PerfValue>) {
      const now = performance.now();
      const elapsedMs = now - lastMarkAt;
      lastMarkAt = now;
      stages[stage] = elapsedMs;
      log(stage, elapsedMs, metadata);
      return elapsedMs;
    },
    measure(stage: string, from: number, metadata?: Record<string, PerfValue>) {
      const now = performance.now();
      const elapsedMs = now - from;
      lastMarkAt = now;
      stages[stage] = elapsedMs;
      log(stage, elapsedMs, metadata);
      return elapsedMs;
    },
    finish(metadata?: Record<string, PerfValue>): AiPerfSummary {
      const totalMs = performance.now() - startedAt;
      log("total", totalMs, metadata);
      return { requestId, totalMs, stages: { ...stages } };
    },
  };
}
