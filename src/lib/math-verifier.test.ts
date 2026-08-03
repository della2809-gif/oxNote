import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMathVerificationCorrections,
  mathVerifierForTests,
  verifyAndCorrectMathDetails,
} from "./math-verifier.ts";

test("대분수와 분수를 정확한 유리수로 계산한다", () => {
  assert.equal(mathVerifierForTests.evaluate("1 4/5 * 1 5/6"), "33/10");
  assert.equal(mathVerifierForTests.evaluate("0.1 + 0.2"), "3/10");
});

test("잘못된 분수 등식의 마지막 결과를 자동 수정한다", () => {
  const result = mathVerifierForTests.verifyFormula(
    "(9/5) * (11/6) = 99/30 = 49/48 cm²",
  );

  assert.equal(result.formula, "(9/5) * (11/6) = 99/30 = 33/10 cm²");
  assert.equal(result.checked, 1);
  assert.equal(result.corrections.length, 1);
});

test("길이 넓이 부피 질량 시간 단위 변환을 검산한다", () => {
  const correctCases = [
    "1 m = 100 cm",
    "1 m² = 10000 cm²",
    "1 L = 1000 mL",
    "1 kg = 1000 g",
    "1 시간 = 60 분",
  ];

  for (const formula of correctCases) {
    const result = mathVerifierForTests.verifyFormula(formula);
    assert.equal(result.corrections.length, 0, formula);
    assert.equal(result.checked, 1, formula);
  }
});

test("잘못된 단위 변환 결과를 목표 단위로 자동 수정한다", () => {
  const result = mathVerifierForTests.verifyFormula("1 m = 10 cm");
  assert.equal(result.formula, "1 m = 100 cm");
  assert.equal(result.corrections.length, 1);
});

test("일차방정식의 해를 이전 식에 대입해 검산한다", () => {
  const correct = mathVerifierForTests.verifySteps([
    { title: "식 정리", explanation: "", formula: "2x + 3 = 7" },
    { title: "해", explanation: "", formula: "x = 2" },
  ]);
  const incorrect = mathVerifierForTests.verifySteps([
    { title: "식 정리", explanation: "", formula: "2x + 3 = 7" },
    { title: "해", explanation: "", formula: "x = 3" },
  ]);

  assert.equal(correct.warnings.length, 0);
  assert.equal(correct.checked, 1);
  assert.equal(incorrect.warnings.length, 1);
});

test("자동 수정 결과를 풀이 결론과 정답 문장에도 반영한다", () => {
  const details = verifyAndCorrectMathDetails({
    title: "넓이 계산",
    subject: "수학",
    gradeLevel: "초5",
    curriculum: "도형과 측정",
    difficulty: "하",
    questionType: "넓이",
    coreConcepts: ["평행사변형의 넓이"],
    solutionSteps: [
      {
        title: "넓이 계산",
        explanation: "계산하면 49/48 cm²입니다.",
        formula: "(9/5) * (11/6) = 99/30 = 49/48 cm²",
      },
    ],
    answerSummary: "평행사변형의 넓이는 49/48 cm²입니다.",
    confusionPoints: [],
  });

  assert.equal(details.solutionSteps[0].explanation, "계산하면 33/10 cm²입니다.");
  assert.equal(details.answerSummary, "평행사변형의 넓이는 33/10 cm²입니다.");
  assert.equal(
    applyMathVerificationCorrections("정답은 49/48 cm²", details.mathVerification),
    "정답은 33/10 cm²",
  );
  assert.equal(
    applyMathVerificationCorrections("정답은 49/48", details.mathVerification),
    "정답은 33/10",
  );
});
