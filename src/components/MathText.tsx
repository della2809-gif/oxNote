import type { ReactNode } from "react";

const fractionPattern = /(?:(\d+)\s*과\s*)?([−-]?(?:\d+(?:\.\d+)?|\([^()\n/]+\)))\s*\/\s*(\d+(?:\.\d+)?)/g;

export default function MathText({ children }: { children: string }) {
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of children.matchAll(fractionPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(children.slice(cursor, index));

    const [, whole, numerator, denominator] = match;
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

  if (cursor < children.length) parts.push(children.slice(cursor));
  return parts.length ? parts : children;
}
