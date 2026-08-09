import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Subject } from "@/lib/types";

type ReviewLogWithSubject = {
  result: "correct" | "incorrect";
  notes: { subject_id: string | null } | null;
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAdmin = user?.app_metadata?.role === "admin";

  const [
    { count: totalNotes },
    { count: masteredNotes },
    { count: dueToday },
    { data: subjects },
    { data: reviewLogs },
    { data: performanceFlag },
    { data: performanceSubscription },
  ] =
    await Promise.all([
      supabase.from("notes").select("id", { count: "exact", head: true }),
      supabase.from("notes").select("id", { count: "exact", head: true }).eq("mastered", true),
      supabase
        .from("notes")
        .select("id", { count: "exact", head: true })
        .eq("mastered", false)
        .lte("next_review_at", new Date().toISOString()),
      supabase.from("subjects").select("id, name, color").order("name"),
      supabase.from("review_logs").select("result, notes(subject_id)"),
      supabase
        .from("product_feature_flags")
        .select("member_enabled")
        .eq("key", "performance_benchmarking")
        .maybeSingle(),
      user
        ? supabase
            .from("subscriptions")
            .select("status, plans(performance_benchmarking_enabled)")
            .eq("user_id", user.id)
            .in("status", ["trialing", "active"])
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const rawPerformancePlan = performanceSubscription?.plans;
  const performancePlan = Array.isArray(rawPerformancePlan)
    ? rawPerformancePlan[0]
    : rawPerformancePlan;
  const canUsePerformance = Boolean(
    performanceFlag?.member_enabled &&
      performancePlan?.performance_benchmarking_enabled,
  );

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

      <section className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6 shadow-sm sm:p-8">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-indigo-200/40 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-bold text-white">Pro</span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-indigo-600 ring-1 ring-indigo-100">출시 준비 중</span>
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-950 sm:text-2xl">내 성적은 비슷한 학생들과 비교하면 어디쯤일까요?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">성적표 AI 인식, 지역·전국 유사 성적군 오답률 비교, 취약 개념 분석과 예상 점수 범위를 한 번에 제공합니다.</p>
            <div className="mt-5 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
              <span className="rounded-xl bg-white/80 px-3 py-3">지역·전국 위치</span>
              <span className="rounded-xl bg-white/80 px-3 py-3">오답 영역 비교</span>
              <span className="rounded-xl bg-white/80 px-3 py-3">예상 점수·추천</span>
            </div>
          </div>
          {isAdmin || canUsePerformance ? (
            <Link href="/performance" className="shrink-0 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800">{isAdmin ? "운영자 미리보기" : "비교 분석 시작"}</Link>
          ) : (
            <button type="button" disabled className="shrink-0 cursor-not-allowed rounded-xl bg-slate-200 px-5 py-3 text-sm font-bold text-slate-500" title="유료회원 전용 기능으로 준비 중입니다.">유료회원 전용 · 준비 중</button>
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
