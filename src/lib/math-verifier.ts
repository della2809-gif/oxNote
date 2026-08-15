import type {
  MathVerification,
  NoteAiDetails,
  NoteSolutionStep,
} from "./types";

type UnitDefinition = {
  dimension: "length" | "area" | "volume" | "mass" | "time" | "ratio";
  numerator: bigint;
  denominator: bigint;
};

type ParsedValue = {
  value: Rational;
  unit: UnitDefinition | null;
  unitText: string;
};

type FormulaVerification = {
  formula: string;
  checked: number;
  corrections: string[];
  warnings: string[];
  replacements: Array<{ from: string; to: string }>;
};

const UNIT_ALIASES: Array<{
  aliases: string[];
  definition: UnitDefinition;
}> = [
  { aliases: ["제곱킬로미터", "km²", "km^2", "㎢"], definition: unit("area", 1_000_000) },
  { aliases: ["제곱미터", "m²", "m^2", "㎡"], definition: unit("area", 1) },
  { aliases: ["제곱센티미터", "cm²", "cm^2", "㎠"], definition: unit("area", 1, 10_000) },
  { aliases: ["제곱밀리미터", "mm²", "mm^2", "㎟"], definition: unit("area", 1, 1_000_000) },
  { aliases: ["세제곱미터", "m³", "m^3", "㎥"], definition: unit("volume", 1_000) },
  { aliases: ["세제곱센티미터", "cm³", "cm^3", "㎤", "mL", "ml", "밀리리터"], definition: unit("volume", 1, 1_000) },
  { aliases: ["킬로미터", "km", "㎞"], definition: unit("length", 1_000) },
  { aliases: ["센티미터", "cm", "㎝"], definition: unit("length", 1, 100) },
  { aliases: ["밀리미터", "mm", "㎜"], definition: unit("length", 1, 1_000) },
  { aliases: ["미터", "m"], definition: unit("length", 1) },
  { aliases: ["리터", "L", "ℓ", "l"], definition: unit("volume", 1) },
  { aliases: ["킬로그램", "kg", "㎏"], definition: unit("mass", 1_000) },
  { aliases: ["밀리그램", "mg", "㎎"], definition: unit("mass", 1, 1_000) },
  { aliases: ["그램", "g", "ｇ"], definition: unit("mass", 1) },
  { aliases: ["시간", "hour", "hours", "hr"], definition: unit("time", 3_600) },
  { aliases: ["분", "minute", "minutes", "min"], definition: unit("time", 60) },
  { aliases: ["초", "second", "seconds", "sec", "s"], definition: unit("time", 1) },
  { aliases: ["%", "퍼센트"], definition: unit("ratio", 1, 100) },
].map((entry) => ({
  ...entry,
  aliases: [...entry.aliases].sort((a, b) => b.length - a.length),
}));

const UNIT_LOOKUP = UNIT_ALIASES.flatMap((entry) =>
  entry.aliases.map((alias) => ({ alias, definition: entry.definition })),
).sort((a, b) => b.alias.length - a.alias.length);

const UNICODE_FRACTIONS: Record<string, [number, number]> = {
  "½": [1, 2],
  "⅓": [1, 3],
  "⅔": [2, 3],
  "¼": [1, 4],
  "¾": [3, 4],
  "⅕": [1, 5],
  "⅖": [2, 5],
  "⅗": [3, 5],
  "⅘": [4, 5],
  "⅙": [1, 6],
  "⅚": [5, 6],
  "⅛": [1, 8],
  "⅜": [3, 8],
  "⅝": [5, 8],
  "⅞": [7, 8],
};

class Rational {
  readonly numerator: bigint;
  readonly denominator: bigint;

  constructor(numerator: bigint, denominator: bigint = 1n) {
    if (denominator === 0n) throw new Error("0으로 나눌 수 없습니다.");
    const sign = denominator < 0n ? -1n : 1n;
    const divisor = gcd(abs(numerator), abs(denominator));
    this.numerator = (numerator * sign) / divisor;
    this.denominator = (denominator * sign) / divisor;
  }

  static fromDecimal(value: string) {
    const negative = value.startsWith("-");
    const unsigned = value.replace(/^[+-]/, "");
    const [whole, fraction = ""] = unsigned.split(".");
    const denominator = 10n ** BigInt(fraction.length);
    const numerator = BigInt(`${whole || "0"}${fraction}` || "0");
    return new Rational(negative ? -numerator : numerator, denominator);
  }

  add(other: Rational) {
    return new Rational(
      this.numerator * other.denominator + other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }

  subtract(other: Rational) {
    return new Rational(
      this.numerator * other.denominator - other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }

  multiply(other: Rational) {
    return new Rational(
      this.numerator * other.numerator,
      this.denominator * other.denominator,
    );
  }

  divide(other: Rational) {
    return new Rational(
      this.numerator * other.denominator,
      this.denominator * other.numerator,
    );
  }

  negate() {
    return new Rational(-this.numerator, this.denominator);
  }

  pow(exponent: number) {
    if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 12) {
      throw new Error("지원하지 않는 지수입니다.");
    }
    if (exponent < 0) {
      const positive = BigInt(-exponent);
      return new Rational(
        this.denominator ** positive,
        this.numerator ** positive,
      );
    }
    return new Rational(
      this.numerator ** BigInt(exponent),
      this.denominator ** BigInt(exponent),
    );
  }

  equals(other: Rational) {
    return (
      this.numerator === other.numerator &&
      this.denominator === other.denominator
    );
  }

  isInteger() {
    return this.denominator === 1n;
  }
}

function unit(
  dimension: UnitDefinition["dimension"],
  numerator: number,
  denominator = 1,
): UnitDefinition {
  return {
    dimension,
    numerator: BigInt(numerator),
    denominator: BigInt(denominator),
  };
}

function abs(value: bigint) {
  return value < 0n ? -value : value;
}

function gcd(a: bigint, b: bigint): bigint {
  let left = a;
  let right = b;
  while (right !== 0n) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }
  return left || 1n;
}

function normalizeExpression(input: string) {
  let value = input
    .trim()
    .replace(/^`+|`+$/g, "")
    .replace(/\\[()[\]]/g, "")
    .replace(/\\times|\\cdot/g, "*")
    .replace(/\\div/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/[×∙·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/(?<=\d),(?=\d{3}(?:\D|$))/g, "");

  for (let index = 0; index < 4; index += 1) {
    const replaced = value.replace(/\\sqrt\s*\{([^{}]+)\}/g, "(($1)^(1/2))");
    if (replaced === value) break;
    value = replaced;
  }

  for (let index = 0; index < 4; index += 1) {
    const replaced = value.replace(
      /\\(?:d?frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g,
      "(($1)/($2))",
    );
    if (replaced === value) break;
    value = replaced;
  }

  for (const [symbol, [numerator, denominator]] of Object.entries(
    UNICODE_FRACTIONS,
  )) {
    value = value.replace(
      new RegExp(`(-?\\d+)${symbol}`, "g"),
      (_match, whole: string) => {
        const negative = whole.startsWith("-");
        const absoluteWhole = whole.replace("-", "");
        return negative
          ? `-(${absoluteWhole}+${numerator}/${denominator})`
          : `(${absoluteWhole}+${numerator}/${denominator})`;
      },
    );
    value = value.replaceAll(symbol, `(${numerator}/${denominator})`);
  }

  value = value.replaceAll("{", "(").replaceAll("}", ")");

  value = value.replace(
    /(-?)(\d+)\s+(\d+)\s*\/\s*(\d+)/g,
    (_match, sign: string, whole: string, numerator: string, denominator: string) =>
      sign === "-"
        ? `-(${whole}+${numerator}/${denominator})`
        : `(${whole}+${numerator}/${denominator})`,
  );

  value = value.replace(/^.*[:：]\s*(?=[(\d.+-])/, "");
  value = value
    .replace(/(\d|\))\s*(?=\()/g, "$1*")
    .replace(/\)\s*(?=\d)/g, ")*");
  return value;
}

function evaluateApproximateExpression(input: string) {
  const tokens = tokenize(normalizeExpression(input));
  let cursor = 0;

  function parseExpression(): number {
    let result = parseTerm();
    while (tokens[cursor] === "+" || tokens[cursor] === "-") {
      const operator = tokens[cursor++];
      const right = parseTerm();
      result = operator === "+" ? result + right : result - right;
    }
    return result;
  }

  function parseTerm(): number {
    let result = parsePower();
    while (tokens[cursor] === "*" || tokens[cursor] === "/") {
      const operator = tokens[cursor++];
      const right = parsePower();
      result = operator === "*" ? result * right : result / right;
    }
    return result;
  }

  function parsePower(): number {
    const base = parseUnary();
    if (tokens[cursor] !== "^") return base;
    cursor += 1;
    return base ** parseUnary();
  }

  function parseUnary(): number {
    if (tokens[cursor] === "+") {
      cursor += 1;
      return parseUnary();
    }
    if (tokens[cursor] === "-") {
      cursor += 1;
      return -parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const token = tokens[cursor++];
    if (!token) throw new Error("계산식이 비어 있습니다.");
    if (token === "(") {
      const result = parseExpression();
      if (tokens[cursor++] !== ")") throw new Error("괄호가 닫히지 않았습니다.");
      return result;
    }
    if (!/^\d|^\./.test(token)) throw new Error("숫자가 필요합니다.");
    return Number(token);
  }

  const result = parseExpression();
  if (cursor !== tokens.length || !Number.isFinite(result)) throw new Error("계산식을 끝까지 해석하지 못했습니다.");
  return result;
}

function tokenize(expression: string) {
  const tokens: string[] = [];
  let cursor = 0;
  while (cursor < expression.length) {
    const remainder = expression.slice(cursor);
    const whitespace = remainder.match(/^\s+/);
    if (whitespace) {
      cursor += whitespace[0].length;
      continue;
    }
    const number = remainder.match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (number) {
      tokens.push(number[0]);
      cursor += number[0].length;
      continue;
    }
    const symbol = remainder[0];
    if ("+-*/^()".includes(symbol)) {
      tokens.push(symbol);
      cursor += 1;
      continue;
    }
    throw new Error(`지원하지 않는 계산 기호: ${symbol}`);
  }
  return tokens;
}

function evaluateExpression(input: string) {
  const tokens = tokenize(normalizeExpression(input));
  let cursor = 0;

  function parseExpression(): Rational {
    let result = parseTerm();
    while (tokens[cursor] === "+" || tokens[cursor] === "-") {
      const operator = tokens[cursor++];
      const right = parseTerm();
      result = operator === "+" ? result.add(right) : result.subtract(right);
    }
    return result;
  }

  function parseTerm(): Rational {
    let result = parsePower();
    while (tokens[cursor] === "*" || tokens[cursor] === "/") {
      const operator = tokens[cursor++];
      const right = parsePower();
      result = operator === "*" ? result.multiply(right) : result.divide(right);
    }
    return result;
  }

  function parsePower(): Rational {
    let result = parseUnary();
    if (tokens[cursor] === "^") {
      cursor += 1;
      const exponent = parseUnary();
      if (!exponent.isInteger()) throw new Error("분수 지수는 지원하지 않습니다.");
      result = result.pow(Number(exponent.numerator));
    }
    return result;
  }

  function parseUnary(): Rational {
    if (tokens[cursor] === "+") {
      cursor += 1;
      return parseUnary();
    }
    if (tokens[cursor] === "-") {
      cursor += 1;
      return parseUnary().negate();
    }
    return parsePrimary();
  }

  function parsePrimary(): Rational {
    const token = tokens[cursor++];
    if (!token) throw new Error("계산식이 비어 있습니다.");
    if (token === "(") {
      const result = parseExpression();
      if (tokens[cursor++] !== ")") throw new Error("괄호가 닫히지 않았습니다.");
      return result;
    }
    if (!/^\d|^\./.test(token)) throw new Error("숫자가 필요합니다.");
    return Rational.fromDecimal(token);
  }

  const result = parseExpression();
  if (cursor !== tokens.length) throw new Error("계산식을 끝까지 해석하지 못했습니다.");
  return result;
}

function parseValue(input: string): ParsedValue | null {
  const trimmed = input.trim().replace(/[.,;]$/, "");
  let expression = trimmed;
  let unitDefinition: UnitDefinition | null = null;
  let unitText = "";

  for (const entry of UNIT_LOOKUP) {
    if (!expression.endsWith(entry.alias)) continue;
    expression = expression.slice(0, -entry.alias.length).trim();
    unitDefinition = entry.definition;
    unitText = entry.alias;
    break;
  }

  if (!expression || /[A-Za-z가-힣]/.test(expression)) return null;
  try {
    return {
      value: evaluateExpression(expression),
      unit: unitDefinition,
      unitText,
    };
  } catch {
    return null;
  }
}

function toBase(value: ParsedValue) {
  if (!value.unit) return value.value;
  return value.value.multiply(
    new Rational(value.unit.numerator, value.unit.denominator),
  );
}

function formatRational(value: Rational) {
  return value.denominator === 1n
    ? value.numerator.toString()
    : `${value.numerator}/${value.denominator}`;
}

function splitEquality(formula: string) {
  if (!formula.includes("=") || /[<>!]=|≠|≤|≥|≈/.test(formula)) return null;
  const segments = formula.split(/(?<![<>!])=(?!=)/).map((segment) => segment.trim());
  return segments.length >= 2 && segments.length <= 6 ? segments : null;
}

function verifyNumericEquality(formula: string): FormulaVerification {
  const result: FormulaVerification = {
    formula,
    checked: 0,
    corrections: [],
    warnings: [],
    replacements: [],
  };
  const segments = splitEquality(formula);
  if (!segments) return result;
  const parsed = segments.map(parseValue);
  if (parsed.some((value) => !value)) {
    try {
      const approximateValues = segments.map(evaluateApproximateExpression);
      const expected = approximateValues[0];
      result.checked += 1;
      for (let index = 1; index < approximateValues.length; index += 1) {
        const tolerance = 1e-9 * Math.max(1, Math.abs(expected), Math.abs(approximateValues[index]));
        if (Math.abs(approximateValues[index] - expected) <= tolerance) continue;
        result.warnings.push(`분수 지수·근호 계산 '${segments[0]}'과 '${segments[index]}'의 값이 일치하지 않습니다.`);
      }
    } catch {
      // 기호식 등 수치 계산으로 확인할 수 없는 식은 기존처럼 건너뛴다.
    }
    return result;
  }

  const values = parsed as ParsedValue[];
  const allUnitsCompatible =
    Boolean(values[0].unit) &&
    values.every(
      (value) =>
        value.unit && value.unit.dimension === values[0].unit?.dimension,
    );
  const useBaseUnits =
    allUnitsCompatible ||
    values.some((value) => value.unit?.dimension === "ratio");
  const expected = useBaseUnits ? toBase(values[0]) : values[0].value;
  result.checked += 1;

  for (let index = 1; index < values.length; index += 1) {
    const candidate = useBaseUnits ? toBase(values[index]) : values[index].value;
    if (candidate.equals(expected)) continue;

    let correctedValue = expected;
    const targetUnit = values[index].unit;
    if (useBaseUnits && targetUnit) {
      correctedValue = expected.divide(
        new Rational(
          targetUnit.numerator,
          targetUnit.denominator,
        ),
      );
    }
    const replacement = `${formatRational(correctedValue)}${
      values[index].unitText ? ` ${values[index].unitText}` : ""
    }`;
    const original = segments[index];
    result.corrections.push(
      `계산식의 '${segments[index]}'을(를) '${replacement}'(으)로 자동 수정했습니다.`,
    );
    result.replacements.push({ from: original, to: replacement });
    if (values[index].unitText) {
      result.replacements.push({
        from: formatRational(values[index].value),
        to: formatRational(correctedValue),
      });
    }
    segments[index] = replacement;
  }

  result.formula = segments.join(" = ");
  return result;
}

function extractAssignments(formula: string) {
  const assignments = new Map<string, Rational>();
  const matches = formula.matchAll(
    /(?<![A-Za-z0-9])([A-Za-z])\s*=\s*(-?(?:\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:\.\d+)?|\.\d+))/g,
  );
  for (const match of matches) {
    try {
      assignments.set(match[1], evaluateExpression(match[2]));
    } catch {
      // 검산할 수 없는 해 표기는 무시한다.
    }
  }
  return assignments;
}

function extractEquation(formula: string) {
  const segments = splitEquality(formula);
  if (!segments || segments.length !== 2) return null;
  if (parseValue(segments[0]) && parseValue(segments[1])) return null;
  if (!/[A-Za-z]/.test(segments[0]) && !/[A-Za-z]/.test(segments[1])) return null;
  return { left: segments[0], right: segments[1], raw: formula };
}

function substituteVariables(expression: string, assignments: Map<string, Rational>) {
  let result = expression;
  for (const [name, value] of assignments) {
    result = result.replaceAll(name, `(${formatRational(value)})`);
  }
  return result;
}

function validateEquationSolution(
  equation: { left: string; right: string; raw: string },
  assignments: Map<string, Rational>,
) {
  if (!assignments.size) return null;
  const left = substituteVariables(equation.left, assignments);
  const right = substituteVariables(equation.right, assignments);
  if (/[A-Za-z가-힣]/.test(left) || /[A-Za-z가-힣]/.test(right)) return null;
  try {
    return evaluateExpression(left).equals(evaluateExpression(right));
  } catch {
    return null;
  }
}

function verifySteps(solutionSteps: NoteSolutionStep[]) {
  let checked = 0;
  const corrections: string[] = [];
  const warnings: string[] = [];
  const replacements: Array<{ from: string; to: string }> = [];
  let previousEquation: { left: string; right: string; raw: string } | null = null;

  const steps = solutionSteps.map((step, index) => {
    const numeric = verifyNumericEquality(step.formula);
    checked += numeric.checked;
    corrections.push(...numeric.corrections.map((text) => `${index + 1}단계: ${text}`));
    warnings.push(...numeric.warnings.map((text) => `${index + 1}단계: ${text}`));
    replacements.push(...numeric.replacements);

    const assignments = extractAssignments(numeric.formula);
    if (previousEquation && assignments.size) {
      const valid = validateEquationSolution(previousEquation, assignments);
      if (valid !== null) {
        checked += 1;
        if (!valid) {
          warnings.push(
            `${index + 1}단계의 해를 이전 식 '${previousEquation.raw}'에 대입하면 성립하지 않습니다.`,
          );
        }
      }
    }

    const equation = extractEquation(numeric.formula);
    const isPureAssignment =
      assignments.size > 0 &&
      /^\s*[A-Za-z]\s*=/.test(numeric.formula) &&
      !/[+*/^]/.test(numeric.formula.split("=")[0]);
    if (equation && !isPureAssignment) previousEquation = equation;

    return {
      ...step,
      explanation: applyReplacements(step.explanation, numeric.replacements),
      formula: numeric.formula,
    };
  });

  return { steps, checked, corrections, warnings, replacements };
}

function applyReplacements(
  text: string,
  replacements: Array<{ from: string; to: string }>,
) {
  return replacements.reduce(
    (result, replacement) => result.replaceAll(replacement.from, replacement.to),
    text,
  );
}

export function verifyAndCorrectMathDetails(details: NoteAiDetails): NoteAiDetails {
  const verification = verifySteps(details.solutionSteps);
  const status: MathVerification["status"] = verification.warnings.length
    ? "needs_review"
    : verification.corrections.length
      ? "corrected"
      : verification.checked
        ? "passed"
        : "not_applicable";

  return {
    ...details,
    solutionSteps: verification.steps,
    answerSummary: applyReplacements(
      details.answerSummary,
      verification.replacements,
    ),
    mathVerification: {
      status,
      checkedCount: verification.checked,
      correctedCount: verification.corrections.length,
      corrections: verification.corrections.slice(0, 10),
      warnings: verification.warnings.slice(0, 10),
      replacements: verification.replacements,
    },
  };
}

export function applyMathVerificationCorrections(
  text: string,
  verification: MathVerification | undefined,
) {
  return applyReplacements(text, verification?.replacements ?? []);
}

export const mathVerifierForTests = {
  evaluate(input: string) {
    return formatRational(evaluateExpression(input));
  },
  verifyFormula: verifyNumericEquality,
  verifySteps,
  evaluateApproximate: evaluateApproximateExpression,
};
