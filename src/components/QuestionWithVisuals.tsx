import MathText from "@/components/MathText";

export type QuestionVisual = {
  url: string;
  altText: string;
  kind?: string;
};

const VISUAL_MARKER = /\[(?:시각\s*자료|도표|그래프|그림)\]/g;

export default function QuestionWithVisuals({
  question,
  visuals = [],
  compact = false,
}: {
  question: string;
  visuals?: QuestionVisual[];
  compact?: boolean;
}) {
  const chunks = question.split(VISUAL_MARKER);
  const hasMarker = chunks.length > 1;

  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      {chunks.map((chunk, index) => (
        <div key={index}>
          {chunk.trim() && (
            <div className="whitespace-pre-wrap break-words">
              <MathText>{chunk.trim()}</MathText>
            </div>
          )}
          {hasMarker && visuals[index] && <VisualImage visual={visuals[index]} compact={compact} />}
        </div>
      ))}
      {!hasMarker && visuals.map((visual, index) => (
        <VisualImage key={`${visual.url}-${index}`} visual={visual} compact={compact} />
      ))}
      {hasMarker && visuals.slice(chunks.length - 1).map((visual, index) => (
        <VisualImage key={`${visual.url}-extra-${index}`} visual={visual} compact={compact} />
      ))}
    </div>
  );
}

function VisualImage({ visual, compact }: { visual: QuestionVisual; compact: boolean }) {
  return (
    <figure className={`${compact ? "my-2" : "my-4"} break-inside-avoid text-center`}>
      {/* Private Supabase Storage assets use short-lived signed URLs. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={visual.url}
        alt={visual.altText}
        className={`mx-auto h-auto max-w-full rounded-lg border border-slate-200 bg-white object-contain ${compact ? "max-h-[72mm]" : "max-h-[480px]"}`}
      />
    </figure>
  );
}
