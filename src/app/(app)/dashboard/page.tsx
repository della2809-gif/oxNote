import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Subject } from "@/lib/types";

type ReviewLogWithSubject = {
  result: "correct" | "incorrect";
  notes: { subject_id: string | null } | null;
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ count: totalNotes }, { count: masteredNotes }, { count: dueToday }, { data: subjects }, { data: reviewLogs }] =
    await Promise.all([
      supabase.from("notes").select("*", { count: "exact", head: true }),
      supabase.from("notes").select("*", { count: "exact", head: true }).eq("mastered", true),
      supabase
        .from("notes")
        .select("*", { count: "exact", head: true })
        .eq("mastered", false)
        .lte("next_review_at", new Date().toISOString()),
      supabase.from("subjects").select("*").order("name"),
      supabase.from("review_logs").select("result, notes(subject_id)"),
    ]);

  const stats = new Map<string, { correct: number; total: number }>();
  for (const log of (reviewLogs as unknown as ReviewLogWithSubject[] | null) ?? []) {
    const subjectId = log.notes?.subject_id ?? "unassigned";
    const entry = stats.get(subjectId) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (log.result === "correct") entry.correct += 1;
    stats.set(subjectId, entry);
  }

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">홈</h1>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="전체오답" value={totalNotes ?? 0} />
        <StatCard label="복습완료" value={masteredNotes ?? 0} />
        <StatCard label="오늘의복습" value={dueToday ?? 0} href="/review" />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-500">과목별 정답률</h2>
        <div className="space-y-2">
          {(subjects as Subject[] | null)?.map((subject) => {
            const entry = stats.get(subject.id);
            const rate = entry && entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : null;
            return (
              <div
                key={subject.id}
                className="flex items-center justify-between rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: subject.color }} />
                  {subject.name}
                </span>
                <div className="flex items-center gap-3">
                  <div className="h-2 w-32 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                    <div
                      className="h-full rounded-full bg-neutral-900 dark:bg-white"
                      style={{ width: `${rate ?? 0}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-sm text-neutral-500">
                    {rate === null ? "-" : `${rate}%`}
                  </span>
                </div>
              </div>
            );
          })}
          {!subjects?.length && (
            <p className="text-sm text-neutral-400">
              <Link href="/subjects" className="underline">
                과목을 먼저 등록해보세요
              </Link>
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, href }: { label: string; value: number; href?: string }) {
  const content = (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
