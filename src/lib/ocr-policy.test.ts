import assert from "node:assert/strict";
import test from "node:test";
import { canUseRecognitionAsAuthoritative, normalizeLatex, recognitionDisposition } from "./ocr-policy.ts";

test("LaTeX wrapper를 제거하되 내부 수식 구조는 보존한다", () => {
  assert.equal(normalizeLatex("$\\sqrt{3}$"), "\\sqrt{3}");
  assert.equal(
    normalizeLatex("\\[9^{\\frac{1}{4}}\\times3^{-\\frac{1}{2}}\\]"),
    "9^{\\frac{1}{4}}\\times3^{-\\frac{1}{2}}",
  );
});

test("낮은 신뢰도나 판독 불확실 결과를 확정 문제로 사용하지 않는다", () => {
  assert.equal(canUseRecognitionAsAuthoritative({ confidence: 0.34, needsReview: true, correctedText: "지수 [판독 불확실]" }), false);
  assert.equal(canUseRecognitionAsAuthoritative({ confidence: 0.98, needsReview: false, correctedText: "깨끗한 문제" }), true);
  assert.equal(canUseRecognitionAsAuthoritative({ confidence: 0.98, needsReview: false, correctedText: "지수 [판독 불확실]" }), false);
});

test("confidence 임계값에 따라 처리 단계를 구분한다", () => {
  assert.equal(recognitionDisposition(0.96), "auto_accept");
  assert.equal(recognitionDisposition(0.84), "ai_review");
  assert.equal(recognitionDisposition(0.72), "retry_or_user_review");
});
