export function isMathClassification(values: unknown[]) {
  return values.some((value) => {
    const label = String(value ?? "").trim().replace(/\s+/g, "");
    return /^\uC218\uD559(?:$|[-\u00B7:/]|\u2160|\u2161|I(?:I)?|[12])/.test(label);
  });
}

export function isLikelyMathProblem(subject: unknown, question = "") {
  if (isMathClassification([subject])) return true;

  const source = String(question ?? "");
  const mathSignals = [
    /\\(?:frac|sqrt|lim|sum|int|sin|cos|tan|log|ln|begin)\b/,
    /(?:^|\s)[a-zA-Z]\s*[=<>]\s*[-+]?\d/,
    /\d\s*[+\-*/^]\s*\d/,
    /(?:방정식|함수|도형|삼각형|확률|수열|미분|적분|극한|로그|지수|분수|근호)/,
  ];
  return mathSignals.filter((pattern) => pattern.test(source)).length >= 2;
}
