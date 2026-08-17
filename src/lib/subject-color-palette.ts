/**
 * Pantone annual trend palettes adapted for small, accessible UI markers.
 * Cloud Dancer (2026) itself is omitted because a white dot disappears on the
 * application's white background. Newer-year colors are exhausted first.
 */
export const SUBJECT_COLOR_PALETTE = [
  // 2026 · Cloud Dancer companion palette
  "#E85D87", // Pink Lemonade
  "#F28C64", // Papaya
  "#C47A44", // Caramel
  "#8F6255", // Cocoa Creme
  "#668577", // Tea
  "#C89B28", // Mango Mojito

  // 2025 · Mocha Mousse palettes
  "#A47864", // Mocha Mousse
  "#D65F5F",
  "#6E7F52",
  "#4F759B",
  "#A66FB5",
  "#D08A2E",

  // 2024 · Peach Fuzz palettes
  "#FFBE98", // Peach Fuzz
  "#D45D79",
  "#6D8DB8",
  "#7A9E7E",
  "#8B6FB3",
  "#D97745",

  // 2023 · Viva Magenta palettes
  "#BB2649", // Viva Magenta
  "#5B7F95",
  "#8A6A9B",
  "#4E8B70",
  "#C06C45",
  "#7A7256",
] as const;

export function subjectColorByIndex(index: number) {
  const normalizedIndex = Math.max(0, Math.trunc(index));
  return SUBJECT_COLOR_PALETTE[normalizedIndex % SUBJECT_COLOR_PALETTE.length];
}

export async function nextSubjectColor(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data: subjects } = await supabase
    .from("subjects")
    .select("color")
    .eq("user_id", userId);
  const usedColors = new Set(
    (subjects ?? []).map((subject) => String(subject.color).toUpperCase()),
  );
  return (
    SUBJECT_COLOR_PALETTE.find((color) => !usedColors.has(color.toUpperCase())) ??
    subjectColorByIndex(subjects?.length ?? 0)
  );
}
import type { SupabaseClient } from "@supabase/supabase-js";
