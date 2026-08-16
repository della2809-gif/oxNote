import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FileAnalysisResult, TextAnalysisResult } from "./analyze";
import { AI_ANALYSIS_VERSION } from "./openai";

export type PracticeProblemCache = {
  question: string;
  hint: string;
  answer: string;
  solution: string;
};

type CachedAnalysis = FileAnalysisResult | TextAnalysisResult | PracticeProblemCache;

export function analysisCacheKey(parts: Array<string | null | undefined>) {
  const hash = createHash("sha256");
  hash.update(AI_ANALYSIS_VERSION);
  for (const part of parts) {
    hash.update("\0");
    hash.update(part ?? "");
  }
  return hash.digest("hex");
}

function isCachedAnalysis(value: unknown): value is CachedAnalysis {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const isAnalysis = (
    typeof record.analysis === "string" &&
    typeof record.mistakeType === "string" &&
    Array.isArray(record.tags) &&
    typeof record.succeeded === "boolean"
  );
  const isPractice =
    typeof record.question === "string" &&
    typeof record.hint === "string" &&
    typeof record.answer === "string" &&
    typeof record.solution === "string";
  return isAnalysis || isPractice;
}

export async function readAnalysisCache<T extends CachedAnalysis>(
  supabase: SupabaseClient,
  userId: string,
  cacheKey: string,
): Promise<T | null> {
  const { data, error } = await supabase
    .from("ai_analysis_cache")
    .select("result")
    .eq("user_id", userId)
    .eq("cache_key", cacheKey)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  // 배포 순서상 마이그레이션이 아직 적용되지 않았어도 기존 분석은 계속 동작한다.
  if (error || !isCachedAnalysis(data?.result)) return null;
  return data.result as T;
}

export async function writeAnalysisCache(
  supabase: SupabaseClient,
  {
    userId,
    cacheKey,
    kind,
    model,
    result,
  }: {
    userId: string;
    cacheKey: string;
    kind: "text_analysis" | "file_analysis";
    model: string;
    result: CachedAnalysis;
  },
) {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("ai_analysis_cache").upsert(
    {
      user_id: userId,
      cache_key: cacheKey,
      kind,
      model,
      analysis_version: AI_ANALYSIS_VERSION,
      result,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,cache_key" },
  );
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    console.error("writeAnalysisCache failed:", error);
  }
}
