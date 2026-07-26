// Leitner-box style spaced repetition: 5 boxes, review interval grows on
// correct answers and resets to box 1 on mistakes.

const BOX_INTERVAL_DAYS: Record<number, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30,
};

export function nextBoxLevel(currentLevel: number, wasCorrect: boolean): number {
  if (!wasCorrect) return 1;
  return Math.min(currentLevel + 1, 5);
}

export function nextReviewDate(boxLevel: number, from: Date = new Date()): Date {
  const days = BOX_INTERVAL_DAYS[boxLevel] ?? 1;
  const next = new Date(from);
  next.setDate(next.getDate() + days);
  return next;
}

export function isMastered(boxLevel: number): boolean {
  return boxLevel >= 5;
}
