import assert from "node:assert/strict";
import test from "node:test";
import { isLikelyMathProblem, isMathClassification } from "./learning-action-policy.ts";

test("명시적인 수학 과목과 수학 교육과정만 허용한다", () => {
  assert.equal(isMathClassification(["수학"]), true);
  assert.equal(isMathClassification(["수학 - 함수의 연속"]), true);
  assert.equal(isMathClassification(["수학Ⅱ"]), true);
});

test("다른 시험의 계산 문제를 수학으로 오인하지 않는다", () => {
  assert.equal(isMathClassification(["토익", "Part 5"]), false);
  assert.equal(isMathClassification(["공인중개사", "부동산 세법 계산"]), false);
  assert.equal(isMathClassification(["국어", "수학적 사고를 다룬 지문"]), false);
});

test("과목명이 없어도 수학식과 수학 개념이 함께 있으면 추론 모델을 사용한다", () => {
  assert.equal(isLikelyMathProblem("", "함수 f(x)=x^2+1의 최솟값을 구하여라."), true);
  assert.equal(isLikelyMathProblem("영어", "다음 글의 주제를 고르시오. 2026년 통계 자료"), false);
});
