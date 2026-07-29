const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(from: Date, days: number) {
  const next = new Date(from);
  next.setTime(next.getTime() + days * DAY_MS);
  return next;
}

export function initialReviewDate(from: Date = new Date()) {
  return addDays(from, 3);
}

export function reviewScheduleAfterResult(
  currentStage: number,
  wasCorrect: boolean,
  from: Date = new Date(),
) {
  if (wasCorrect) {
    return {
      stage: Math.max(currentStage, 4),
      nextReviewAt: addDays(from, 30),
      mastered: true,
    };
  }

  const firstRetry = currentStage <= 1;
  return {
    stage: firstRetry ? 2 : 3,
    nextReviewAt: addDays(from, firstRetry ? 7 : 30),
    mastered: false,
  };
}
