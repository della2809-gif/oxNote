import katex from "katex";
import type { ReactNode } from "react";

const mathDelimiterPattern = /(\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g;
const plainFractionPattern = /(?:(\d+)\s*과\s*)?([−-]?(?:(?:\d+)?√(?:\d+|[A-Za-z])|\d+(?:\.\d+)?|\([^()\n/]+\)))\s*\/\s*([−-]?(?:\d+(?:\.\d+)?|[A-Za-z]+|\([^()\n/]+\)))/g;

function normalizeEscapedLatex(value: string) {
  return value
    .replace(/\\\\(?=(?:d?frac|sqrt|times|cdot|div|left|right|text|mathrm|operatorname|sum|prod|int|lim|log|ln|sin|cos|tan|theta|alpha|beta|gamma|pi|infty|[()[\]]))/g, "\\")
    .replace(/[−–—]/g, "-");
}

function renderLatex(expression: string, displayMode: boolean, key: string) {
  const html = katex.renderToString(expression, {
    displayMode,
    output: "htmlAndMathml",
    strict: "ignore",
    throwOnError: false,
    trust: false,
  });

  return (
    <span
      key={key}
      className={displayMode ? "my-2 block overflow-x-auto py-1 text-center" : "mx-0.5 inline-block max-w-full align-middle"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function toLatexToken(value: string) {
  const unwrapped = value.startsWith("(") && value.endsWith(")") ? value.slice(1, -1) : value;
  return unwrapped.replace(/(\d*)√(\d+|[A-Za-z])/g, (_match, coefficient: string, radicand: string) => `${coefficient}\\sqrt{${radicand}}`);
}

function renderPlainText(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(plainFractionPattern)) {
    const index = match.index ?? 0;
    const previousCharacter = text[index - 1] ?? "";
    const nextCharacter = text[index + match[0].length] ?? "";
    if (previousCharacter === "/" || nextCharacter === "/") continue;
    if (index > cursor) parts.push(text.slice(cursor, index));

    const [, whole, numerator, denominator] = match;
    const latex = `${whole ?? ""}\\frac{${toLatexToken(numerator)}}{${toLatexToken(denominator)}}`;
    parts.push(renderLatex(latex, false, `${keyPrefix}-fraction-${index}`));
    cursor = index + match[0].length;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.length ? parts : [text];
}

function unwrapDelimitedMath(value: string) {
  if (value.startsWith("\\[") && value.endsWith("\\]")) return { expression: value.slice(2, -2), displayMode: true };
  if (value.startsWith("\\(") && value.endsWith("\\)")) return { expression: value.slice(2, -2), displayMode: false };
  if (value.startsWith("$$") && value.endsWith("$$")) return { expression: value.slice(2, -2), displayMode: true };
  return { expression: value.slice(1, -1), displayMode: false };
}

export default function MathText({ children }: { children: string }) {
  const text = normalizeEscapedLatex(children);
  const delimited = Array.from(text.matchAll(mathDelimiterPattern));

  if (!delimited.length && /\\(?:d?frac|sqrt|times|cdot)|\^\{/.test(text) && !/[가-힣]/.test(text)) {
    return renderLatex(text, false, "standalone-math");
  }

  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of delimited) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(...renderPlainText(text.slice(cursor, index), `plain-${cursor}`));
    const { expression, displayMode } = unwrapDelimitedMath(match[0]);
    parts.push(renderLatex(expression, displayMode, `math-${index}`));
    cursor = index + match[0].length;
  }
  if (cursor < text.length) parts.push(...renderPlainText(text.slice(cursor), `plain-${cursor}`));
  return parts.length ? parts : text;
}
