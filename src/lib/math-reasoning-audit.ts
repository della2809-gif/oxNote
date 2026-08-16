import "server-only";

import { getOpenAI, GPT_REASONING_MODEL, OPENAI_REASONING_EFFORT } from "./openai";
import type { NoteAiDetails, NoteSolutionStep } from "./types";

const AUDIT_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["passed", "corrected", "needs_review"] },
    answer: { type: "string" },
    answer_summary: { type: "string" },
    solution_steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          explanation: { type: "string" },
          formula: { type: "string" },
        },
        required: ["title", "explanation", "formula"],
        additionalProperties: false,
      },
    },
    checks: {
      type: "object",
      properties: {
        conditions_used: { type: "boolean" },
        domain_checked: { type: "boolean" },
        arithmetic_checked: { type: "boolean" },
        unique_answer: { type: "boolean" },
        choices_consistent: { type: "boolean" },
      },
      required: ["conditions_used", "domain_checked", "arithmetic_checked", "unique_answer", "choices_consistent"],
      additionalProperties: false,
    },
    issues: { type: "array", items: { type: "string" } },
  },
  required: ["status", "answer", "answer_summary", "solution_steps", "checks", "issues"],
  additionalProperties: false,
} as const;

export type MathReasoningAudit = {
  status: "passed" | "corrected" | "needs_review";
  checks: {
    conditionsUsed: boolean;
    domainChecked: boolean;
    arithmeticChecked: boolean;
    uniqueAnswer: boolean;
    choicesConsistent: boolean;
  };
  issues: string[];
  model: string;
};

export async function auditMathAnalysis({
  question,
  answer,
  details,
  signal,
}: {
  question: string;
  answer: string;
  details: NoteAiDetails;
  signal?: AbortSignal;
}) {
  const response = await getOpenAI().responses.create({
    model: GPT_REASONING_MODEL,
    reasoning: { effort: OPENAI_REASONING_EFFORT },
    input: [
      {
        role: "system",
        content: [
          "You are an independent Korean math-solution auditor.",
          "Solve the problem from scratch before judging the proposed answer.",
          "Verify every stated condition, domain/restriction, arithmetic, uniqueness, and multiple-choice consistency.",
          "Do not preserve a flawed derivation. If it is repairable, return a complete corrected 3-8 step solution.",
          "Use each mathematical expression exactly once in valid LaTeX delimiters: inline \\( ... \\), block \\[ ... \\].",
          "Never expose raw LaTeX commands outside delimiters and never duplicate a formula as plain text.",
          "Use needs_review when the source is ambiguous, cropped, internally inconsistent, or cannot support a unique answer.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          question,
          proposedAnswer: answer,
          proposedAnswerSummary: details.answerSummary,
          proposedSteps: details.solutionSteps,
          recognizedConditions: details.recognizedConditions ?? [],
        }),
      },
    ],
    text: {
      verbosity: "medium",
      format: {
        type: "json_schema",
        name: "xonote_math_reasoning_audit",
        strict: true,
        schema: AUDIT_SCHEMA,
      },
    },
  }, { signal });

  const parsed = JSON.parse(response.output_text || "{}") as {
    status: MathReasoningAudit["status"];
    answer: string;
    answer_summary: string;
    solution_steps: NoteSolutionStep[];
    checks: {
      conditions_used: boolean;
      domain_checked: boolean;
      arithmetic_checked: boolean;
      unique_answer: boolean;
      choices_consistent: boolean;
    };
    issues: string[];
  };
  const audit: MathReasoningAudit = {
    status: parsed.status,
    checks: {
      conditionsUsed: parsed.checks.conditions_used,
      domainChecked: parsed.checks.domain_checked,
      arithmeticChecked: parsed.checks.arithmetic_checked,
      uniqueAnswer: parsed.checks.unique_answer,
      choicesConsistent: parsed.checks.choices_consistent,
    },
    issues: parsed.issues,
    model: GPT_REASONING_MODEL,
  };

  return {
    answer: parsed.answer,
    details: {
      ...details,
      solutionSteps: parsed.solution_steps,
      answerSummary: parsed.answer_summary,
      reasoningAudit: audit,
    },
    audit,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    },
  };
}
