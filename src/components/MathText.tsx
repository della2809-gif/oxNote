import type { ReactNode } from "react";

const fractionPattern = /\\(?:d?frac)\s*\{([^{}\n]+)\}\s*\{([^{}\n]+)\}|(?:(\d+)\s*과\s*)?([−-]?(?:(?:\d+)?√(?:\d+|[A-Za-z])|\d+(?:\.\d+)?|\([^()\n/]+\)))\s*\/\s*([−-]?(?:\d+(?:\.\d+)?|[A-Za-z]+|\([^()\n/]+\)))/g;

function normalizeMathText(value: string) {
  return value
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, "√$1")
    .replace(/\\[()[\]]/g, "")
    .replace(/\$\$/g, "");
}

export default function MathText({ children }: { children: string }) {
  const text = normalizeMathText(children);
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(fractionPattern)) {
    const index = match.index ?? 0;
    const previousCharacter = text[index - 1] ?? "";
    const nextCharacter = text[index + match[0].length] ?? "";
    if (previousCharacter === "/" || nextCharacter === "/") continue;
    if (index > cursor) parts.push(text.slice(cursor, index));

    const latexNumerator = match[1];
    const latexDenominator = match[2];
    const whole = match[3];
    const numerator = latexNumerator ?? match[4];
    const denominator = latexDenominator ?? match[5];
    const displayNumerator =
      numerator.startsWith("(") && numerator.endsWith(")")
        ? numerator.slice(1, -1)
        : numerator;
    const spoken = whole
      ? `${whole}와 ${denominator}분의 ${displayNumerator}`
      : `${denominator}분의 ${displayNumerator}`;

    parts.push(
      <span
        key={`${index}-${match[0]}`}
        className="mx-0.5 inline-flex items-center align-middle whitespace-nowrap"
        aria-label={spoken}
        role="math"
      >
        <span aria-hidden="true" className="inline-flex items-center">
          {whole && <span className="mr-0.5">{whole}</span>}
          <span className="inline-grid min-w-[1.35em] grid-rows-2 text-center text-[0.78em] font-semibold leading-none">
            <span className="border-b border-current px-0.5 pb-[0.12em]">{displayNumerator}</span>
            <span className="px-0.5 pt-[0.12em]">{denominator}</span>
          </span>
        </span>
      </span>,
    );
    cursor = index + match[0].length;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.length ? parts : text;
}
