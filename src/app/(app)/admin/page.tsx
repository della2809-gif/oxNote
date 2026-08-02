import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  resolveDeletionRequest,
  updateAccountStatus,
  updateUserPlan,
} from "./actions";

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  account_status: "active" | "suspended";
  date_of_birth: string | null;
  guardian_required: boolean;
  guardian_consent_status: "not_required" | "pending" | "granted" | "withdrawn";
  created_at: string;
};

type Subscription = {
  user_id: string;
  payer_user_id: string | null;
  plan_id: string;
  status: "trialing" | "active" | "past_due" | "canceled" | "paused";
  provider: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

type Plan = {
  id: string;
  name: string;
  monthly_price_krw: number;
  monthly_ai_credits: number;
};

type UsageEvent = {
  user_id: string;
  kind: "text_analysis" | "file_analysis";
  units: number;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_usd: number | null;
  status: "reserved" | "succeeded" | "failed";
  failure_reason: string | null;
  created_at: string;
};

type GuardianLink = {
  id: string;
  child_user_id: string;
  guardian_user_id: string;
  relationship: "parent" | "legal_guardian" | "other";
  status: "pending" | "active" | "rejected" | "revoked";
  can_view_learning: boolean;
  can_manage_account: boolean;
  can_manage_billing: boolean;
  created_at: string;
};

type DeletionRequest = {
  id: string;
  user_id: string;
  reason: string | null;
  status: "requested" | "processing" | "completed" | "canceled";
  requested_at: string;
};

type SearchParams = {
  error?: string;
  q?: string;
  segment?: string;
};

const STATUS_LABELS: Record<string, string> = {
  active: "정상",
  suspended: "이용 정지",
  trialing: "체험 중",
  past_due: "결제 실패",
  paused: "일시 정지",
  canceled: "해지",
  pending: "동의 대기",
  granted: "동의 완료",
  withdrawn: "동의 철회",
  not_required: "동의 불필요",
  requested: "접수",
  processing: "처리 중",
};

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (user.app_metadata?.role !== "admin") redirect("/dashboard");

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const previousMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );

  const [
    profilesResult,
    subscriptionsResult,
    plansResult,
    usageResult,
    guardianLinksResult,
    deletionRequestsResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, email, display_name, account_status, date_of_birth, guardian_required, guardian_consent_status, created_at",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("subscriptions")
      .select(
        "user_id, payer_user_id, plan_id, status, provider, current_period_end, cancel_at_period_end",
      ),
    supabase
      .from("plans")
      .select("id, name, monthly_price_krw, monthly_ai_credits")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("usage_events")
      .select(
        "user_id, kind, units, input_tokens, output_tokens, estimated_cost_usd, status, failure_reason, created_at",
      )
      .gte("created_at", previousMonthStart.toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("guardian_links")
      .select(
        "id, child_user_id, guardian_user_id, relationship, status, can_view_learning, can_manage_account, can_manage_billing, created_at",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("account_deletion_requests")
      .select("id, user_id, reason, status, requested_at")
      .in("status", ["requested", "processing"])
      .order("requested_at"),
  ]);

  const dataErrors = [
    profilesResult.error,
    subscriptionsResult.error,
    plansResult.error,
    usageResult.error,
    guardianLinksResult.error,
    deletionRequestsResult.error,
  ].filter(Boolean);

  const profiles = (profilesResult.data as Profile[] | null) ?? [];
  const subscriptions =
    (subscriptionsResult.data as Subscription[] | null) ?? [];
  const plans = (plansResult.data as Plan[] | null) ?? [];
  const usageEvents = (usageResult.data as UsageEvent[] | null) ?? [];
  const guardianLinks =
    (guardianLinksResult.data as GuardianLink[] | null) ?? [];
  const deletionRequests =
    (deletionRequestsResult.data as DeletionRequest[] | null) ?? [];

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const subscriptionByUser = new Map(
    subscriptions.map((subscription) => [subscription.user_id, subscription]),
  );
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const guardianIds = new Set(
    guardianLinks.map((link) => link.guardian_user_id),
  );

  const currentMonthUsage = usageEvents.filter(
    (event) => new Date(event.created_at) >= monthStart,
  );
  const completedUsage = currentMonthUsage.filter(
    (event) => event.status === "succeeded",
  );
  const failedUsage = currentMonthUsage.filter(
    (event) => event.status === "failed",
  );
  const totalRequests = completedUsage.length + failedUsage.length;
  const successRate =
    totalRequests === 0
      ? 100
      : Math.round((completedUsage.length / totalRequests) * 1000) / 10;
  const estimatedAiCost = completedUsage.reduce(
    (sum, event) => sum + Number(event.estimated_cost_usd ?? 0),
    0,
  );
  const totalTokens = completedUsage.reduce(
    (sum, event) =>
      sum + Number(event.input_tokens ?? 0) + Number(event.output_tokens ?? 0),
    0,
  );

  const paidSubscriptions = subscriptions.filter(
    (subscription) =>
      subscription.plan_id !== "free" &&
      ["trialing", "active"].includes(subscription.status),
  );
  const monthlyRecurringRevenue = paidSubscriptions.reduce(
    (sum, subscription) =>
      sum + Number(planById.get(subscription.plan_id)?.monthly_price_krw ?? 0),
    0,
  );
  const newMembers = profiles.filter(
    (profile) => new Date(profile.created_at) >= monthStart,
  ).length;
  const pendingGuardianConsent = profiles.filter(
    (profile) =>
      profile.guardian_required &&
      profile.guardian_consent_status !== "granted",
  ).length;
  const paymentRisk = subscriptions.filter(
    (subscription) => subscription.status === "past_due",
  ).length;
  const activeGuardianLinks = guardianLinks.filter(
    (link) => link.status === "active",
  ).length;

  const query = (params.q ?? "").trim().toLocaleLowerCase("ko-KR");
  const segment = params.segment ?? "all";
  const filteredProfiles = profiles
    .filter((profile) => {
      if (!query) return true;
      return [profile.display_name, profile.email, profile.id].some((value) =>
        value?.toLocaleLowerCase("ko-KR").includes(query),
      );
    })
    .filter((profile) => {
      if (segment === "minor") return profile.guardian_required;
      if (segment === "guardian") return guardianIds.has(profile.id);
      if (segment === "paid") {
        const subscription = subscriptionByUser.get(profile.id);
        return Boolean(
          subscription &&
            subscription.plan_id !== "free" &&
            ["trialing", "active"].includes(subscription.status),
        );
      }
      if (segment === "suspended") return profile.account_status === "suspended";
      return true;
    });

  const planDistribution = plans.map((plan) => ({
    ...plan,
    count: subscriptions.filter(
      (subscription) =>
        subscription.plan_id === plan.id &&
        ["trialing", "active"].includes(subscription.status),
    ).length,
  }));
  const maxPlanCount = Math.max(1, ...planDistribution.map((plan) => plan.count));

  return (
    <div className="min-h-screen text-slate-950">
      <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden h-fit rounded-3xl bg-slate-950 p-5 text-white shadow-xl xl:sticky xl:top-6 xl:block">
          <div className="mb-8 flex items-center gap-3">
            <BrandMark />
            <div>
              <p className="font-semibold">xonote</p>
              <p className="text-xs text-slate-400">Operations Console</p>
            </div>
          </div>
          <nav className="space-y-1 text-sm">
            <AdminNav href="#overview" icon="⌂" label="운영 현황" active />
            <AdminNav href="#members" icon="◎" label="회원 관리" />
            <AdminNav href="#guardians" icon="♧" label="보호자·동의" />
            <AdminNav href="#billing" icon="₩" label="구독·결제" />
            <AdminNav href="#ai-operations" icon="✦" label="AI 운영" />
            <AdminNav href="/admin/performance" icon="↗" label="성적·비교 분석" />
            <AdminNav href="#requests" icon="◫" label="처리 요청" />
          </nav>
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-medium text-slate-300">관리자 세션</p>
            <p className="mt-2 truncate text-sm">{user.email}</p>
            <div className="mt-3 flex items-center gap-2 text-xs text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              권한 확인됨
            </div>
          </div>
        </aside>

        <main className="min-w-0 space-y-6">
          <section
            id="overview"
            className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="border-b border-slate-100 px-5 py-6 sm:px-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-indigo-600">
                    <span className="h-2 w-2 rounded-full bg-indigo-500" />
                    운영 시스템 정상
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    안녕하세요, 운영자님
                  </h1>
                  <p className="mt-2 text-sm text-slate-500">
                    회원, 보호자 동의, 매출과 AI 품질을 한곳에서 확인하세요.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    {now.toLocaleDateString("ko-KR", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                  <Link
                    href="/dashboard"
                    className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                  >
                    학습 서비스로
                  </Link>
                </div>
              </div>
            </div>

            {(params.error || dataErrors.length > 0) && (
              <div className="mx-5 mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:mx-7">
                {params.error ??
                  "일부 운영 데이터를 불러오지 못했습니다. DB 마이그레이션과 관리자 권한을 확인해 주세요."}
              </div>
            )}

            <div className="grid gap-px bg-slate-100 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="전체 회원"
                value={profiles.length.toLocaleString("ko-KR")}
                detail={`이번 달 +${newMembers.toLocaleString("ko-KR")}명`}
                accent="indigo"
                icon="◎"
              />
              <Metric
                label="유료 활성 구독"
                value={paidSubscriptions.length.toLocaleString("ko-KR")}
                detail={`월 예상 매출 ${formatWon(monthlyRecurringRevenue)}`}
                accent="emerald"
                icon="₩"
              />
              <Metric
                label="이번 달 AI 분석"
                value={completedUsage.length.toLocaleString("ko-KR")}
                detail={`성공률 ${successRate}%`}
                accent="violet"
                icon="✦"
              />
              <Metric
                label="보호자 동의 대기"
                value={pendingGuardianConsent.toLocaleString("ko-KR")}
                detail={`활성 연결 ${activeGuardianLinks}건`}
                accent={pendingGuardianConsent > 0 ? "amber" : "slate"}
                icon="♧"
              />
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <SectionTitle
                eyebrow="Business"
                title="요금제별 활성 구독"
                description="현재 활성·체험 구독의 분포와 예상 월 매출입니다."
              />
              <div className="mt-7 space-y-5">
                {planDistribution.map((plan) => (
                  <div key={plan.id}>
                    <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                      <div>
                        <span className="font-semibold">{plan.name}</span>
                        <span className="ml-2 text-slate-400">
                          {plan.monthly_price_krw === 0
                            ? "무료"
                            : `${formatWon(plan.monthly_price_krw)}/월`}
                        </span>
                      </div>
                      <span className="font-semibold">{plan.count}명</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                        style={{
                          width: `${Math.max(
                            plan.count > 0 ? 8 : 0,
                            (plan.count / maxPlanCount) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
                {planDistribution.length === 0 && (
                  <EmptyState text="등록된 활성 요금제가 없습니다." />
                )}
              </div>
            </div>

            <div className="rounded-3xl bg-slate-950 p-5 text-white shadow-xl sm:p-6">
              <SectionTitle
                eyebrow="Action center"
                title="오늘 확인할 항목"
                description="운영 위험을 우선순위대로 정리했습니다."
                dark
              />
              <div className="mt-5 space-y-3">
                <ActionItem
                  count={paymentRisk}
                  label="결제 실패 구독"
                  tone="rose"
                  href="#billing"
                />
                <ActionItem
                  count={pendingGuardianConsent}
                  label="보호자 동의 필요"
                  tone="amber"
                  href="#guardians"
                />
                <ActionItem
                  count={failedUsage.length}
                  label="AI 분석 실패"
                  tone="violet"
                  href="#ai-operations"
                />
                <ActionItem
                  count={deletionRequests.length}
                  label="계정 삭제 요청"
                  tone="slate"
                  href="#requests"
                />
              </div>
            </div>
          </section>

          <section
            id="members"
            className="scroll-mt-6 rounded-3xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="border-b border-slate-100 p-5 sm:p-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <SectionTitle
                  eyebrow="Members"
                  title="회원 관리"
                  description="학습자와 보호자 계정 상태, 요금제와 학습 데이터 내려받기 권한을 관리합니다."
                />
                <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto">
                  <Link
                    href="/admin/users/new"
                    className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    + 회원 추가
                  </Link>
                  <form className="flex min-w-0 flex-1 flex-wrap gap-2 lg:flex-none" action="/admin">
                  <label className="relative min-w-[220px] flex-1">
                    <span className="sr-only">회원 검색</span>
                    <input
                      name="q"
                      defaultValue={params.q}
                      placeholder="이름, 이메일, 회원 ID 검색"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                    />
                  </label>
                  <select
                    name="segment"
                    defaultValue={segment}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                  >
                    <option value="all">전체 회원</option>
                    <option value="minor">미성년 학습자</option>
                    <option value="guardian">보호자</option>
                    <option value="paid">유료 회원</option>
                    <option value="suspended">이용 정지</option>
                  </select>
                  <button className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500">
                    검색
                  </button>
                  </form>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-left text-sm">
                <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4">회원</th>
                    <th className="px-4 py-4">구분</th>
                    <th className="px-4 py-4">보호자 동의</th>
                    <th className="px-4 py-4">계정 상태</th>
                    <th className="px-4 py-4">요금제·내려받기 권한</th>
                    <th className="px-6 py-4 text-right">가입일</th>
                    <th className="px-6 py-4 text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProfiles.slice(0, 30).map((profile) => {
                    const subscription = subscriptionByUser.get(profile.id);
                    const plan = planById.get(subscription?.plan_id ?? "free");
                    const isGuardian = guardianIds.has(profile.id);
                    return (
                      <tr key={profile.id} className="align-top hover:bg-slate-50/70">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar
                              label={profile.display_name ?? profile.email ?? "U"}
                            />
                            <div className="min-w-0">
                              <p className="max-w-[220px] truncate font-semibold">
                                {profile.display_name ?? "이름 미등록"}
                              </p>
                              <p className="max-w-[240px] truncate text-xs text-slate-500">
                                {profile.email ?? profile.id}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            {profile.guardian_required && (
                              <Badge label="미성년 학습자" tone="violet" />
                            )}
                            {isGuardian && <Badge label="보호자" tone="blue" />}
                            {!profile.guardian_required && !isGuardian && (
                              <Badge label="일반 회원" tone="slate" />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge status={profile.guardian_consent_status} />
                        </td>
                        <td className="px-4 py-4">
                          <form action={updateAccountStatus} className="flex gap-2">
                            <input type="hidden" name="userId" value={profile.id} />
                            <select
                              name="accountStatus"
                              defaultValue={profile.account_status}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                            >
                              <option value="active">정상</option>
                              <option value="suspended">이용 정지</option>
                            </select>
                            <button className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50">
                              저장
                            </button>
                          </form>
                        </td>
                        <td className="px-4 py-4">
                          <form action={updateUserPlan} className="flex gap-2">
                            <input type="hidden" name="userId" value={profile.id} />
                            <select
                              name="planId"
                              defaultValue={subscription?.plan_id ?? "free"}
                              className="max-w-[110px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                            >
                              {plans.map((availablePlan) => (
                                <option key={availablePlan.id} value={availablePlan.id}>
                                  {availablePlan.name}
                                </option>
                              ))}
                            </select>
                            <select
                              name="status"
                              defaultValue={subscription?.status ?? "active"}
                              className="max-w-[110px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                            >
                              <option value="active">정상</option>
                              <option value="trialing">체험 중</option>
                              <option value="past_due">결제 실패</option>
                              <option value="paused">일시 정지</option>
                              <option value="canceled">해지</option>
                            </select>
                            <button className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-700">
                              저장
                            </button>
                          </form>
                          <p className="mt-1.5 text-xs text-slate-400">
                            {plan?.monthly_price_krw
                              ? `${formatWon(plan.monthly_price_krw)}/월`
                              : "무료"}
                          </p>
                          <p
                            className={`mt-1 text-xs font-medium ${
                              subscription?.plan_id !== "free" &&
                              (subscription?.status === "active" ||
                                subscription?.status === "trialing") &&
                              Boolean(
                                subscription?.current_period_end &&
                                  new Date(subscription.current_period_end).getTime() >
                                    now.getTime(),
                              )
                                ? "text-emerald-600"
                                : "text-slate-400"
                            }`}
                          >
                            {subscription?.plan_id !== "free" &&
                            (subscription?.status === "active" ||
                              subscription?.status === "trialing") &&
                            Boolean(
                              subscription?.current_period_end &&
                                new Date(subscription.current_period_end).getTime() >
                                  now.getTime(),
                            )
                              ? "학습 데이터 내려받기 허용"
                              : "학습 데이터 내려받기 차단"}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-right text-xs text-slate-500">
                          {formatDate(profile.created_at)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link
                            href={`/admin/users/${profile.id}`}
                            className="inline-flex rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                          >
                            상세 관리
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredProfiles.length === 0 && (
                <div className="p-10">
                  <EmptyState text="조건에 맞는 회원이 없습니다." />
                </div>
              )}
            </div>
            {filteredProfiles.length > 30 && (
              <p className="border-t border-slate-100 px-6 py-4 text-center text-xs text-slate-500">
                검색 성능을 위해 최근 30명만 표시합니다. 검색어를 입력해 회원을
                찾아보세요.
              </p>
            )}
          </section>

          <section
            id="guardians"
            className="scroll-mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]"
          >
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <SectionTitle
                eyebrow="Family safety"
                title="보호자 연결 현황"
                description="자녀 계정의 동의와 관리 권한을 확인합니다."
              />
              <div className="mt-6 grid grid-cols-2 gap-3">
                <MiniMetric label="전체 연결" value={guardianLinks.length} />
                <MiniMetric label="활성 연결" value={activeGuardianLinks} />
                <MiniMetric
                  label="연결 대기"
                  value={guardianLinks.filter((link) => link.status === "pending").length}
                  tone="amber"
                />
                <MiniMetric
                  label="동의 미완료"
                  value={pendingGuardianConsent}
                  tone="rose"
                />
              </div>
              <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                <p className="text-sm font-semibold text-indigo-950">
                  보호자에게 공개되는 범위
                </p>
                <p className="mt-1.5 text-xs leading-5 text-indigo-700">
                  학습 현황, 계정 관리, 결제 권한을 각각 분리해 연결별로
                  관리합니다. 학생의 개인 메모와 튜터 대화는 기본 공개 대상에서
                  제외합니다.
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-5 sm:p-6">
                <SectionTitle
                  eyebrow="Relationships"
                  title="최근 보호자 연결"
                  description="활성·대기·해제된 가족 연결과 권한 범위입니다."
                />
              </div>
              <div className="divide-y divide-slate-100">
                {guardianLinks.slice(0, 8).map((link) => {
                  const child = profileById.get(link.child_user_id);
                  const guardian = profileById.get(link.guardian_user_id);
                  return (
                    <div
                      key={link.id}
                      className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar label={child?.display_name ?? child?.email ?? "자"} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {child?.display_name ?? child?.email ?? "자녀 계정"}
                            <span className="mx-2 text-slate-300">→</span>
                            {guardian?.display_name ??
                              guardian?.email ??
                              "보호자 계정"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {relationshipLabel(link.relationship)} ·{" "}
                            {formatDate(link.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {link.can_view_learning && (
                          <Badge label="학습" tone="blue" />
                        )}
                        {link.can_manage_account && (
                          <Badge label="계정" tone="violet" />
                        )}
                        {link.can_manage_billing && (
                          <Badge label="결제" tone="emerald" />
                        )}
                        <StatusBadge status={link.status} />
                      </div>
                    </div>
                  );
                })}
                {guardianLinks.length === 0 && (
                  <div className="p-8">
                    <EmptyState text="아직 등록된 보호자 연결이 없습니다." />
                  </div>
                )}
              </div>
            </div>
          </section>

          <section
            id="billing"
            className="scroll-mt-6 rounded-3xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="border-b border-slate-100 p-5 sm:p-6">
              <SectionTitle
                eyebrow="Revenue"
                title="구독·결제 운영"
                description="유료 구독, 보호자 결제, 갱신 위험을 확인합니다."
              />
            </div>
            <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="예상 월 반복매출"
                value={formatWon(monthlyRecurringRevenue)}
                detail="활성·체험 구독 기준"
                accent="emerald"
                icon="₩"
                compact
              />
              <Metric
                label="보호자 결제 구독"
                value={subscriptions
                  .filter(
                    (subscription) =>
                      subscription.payer_user_id &&
                      subscription.payer_user_id !== subscription.user_id,
                  )
                  .length.toLocaleString("ko-KR")}
                detail="자녀와 결제자가 다른 구독"
                accent="blue"
                icon="♧"
                compact
              />
              <Metric
                label="결제 실패"
                value={paymentRisk.toLocaleString("ko-KR")}
                detail="재결제 안내 필요"
                accent={paymentRisk > 0 ? "rose" : "slate"}
                icon="!"
                compact
              />
              <Metric
                label="해지 예정"
                value={subscriptions
                  .filter((subscription) => subscription.cancel_at_period_end)
                  .length.toLocaleString("ko-KR")}
                detail="현재 결제 주기 종료 후"
                accent="amber"
                icon="↘"
                compact
              />
            </div>
          </section>

          <section
            id="ai-operations"
            className="scroll-mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]"
          >
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <SectionTitle
                eyebrow="AI operations"
                title="AI 품질·비용"
                description="이번 달 실제 분석 요청의 품질과 사용 비용입니다."
              />
              <div className="mt-6 grid grid-cols-2 gap-3">
                <MiniMetric
                  label="분석 성공률"
                  value={`${successRate}%`}
                  tone={successRate < 95 ? "amber" : "emerald"}
                />
                <MiniMetric
                  label="실패 요청"
                  value={failedUsage.length}
                  tone={failedUsage.length > 0 ? "rose" : "slate"}
                />
                <MiniMetric
                  label="처리 토큰"
                  value={compactNumber(totalTokens)}
                />
                <MiniMetric
                  label="예상 AI 비용"
                  value={`$${estimatedAiCost.toFixed(2)}`}
                />
              </div>
              <div className="mt-5">
                <div className="mb-2 flex justify-between text-xs text-slate-500">
                  <span>분석 성공</span>
                  <span>{successRate}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-rose-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${successRate}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-5 sm:p-6">
                <SectionTitle
                  eyebrow="Failure queue"
                  title="최근 분석 실패"
                  description="반복되는 오류 원인을 우선 확인하세요."
                />
              </div>
              <div className="divide-y divide-slate-100">
                {failedUsage.slice(0, 6).map((event, index) => {
                  const profile = profileById.get(event.user_id);
                  return (
                    <div
                      key={`${event.user_id}-${event.created_at}-${index}`}
                      className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {profile?.email ?? "알 수 없는 회원"}
                        </p>
                        <p className="mt-1 truncate text-xs text-rose-600">
                          {failureLabel(event.failure_reason)}
                        </p>
                      </div>
                      <div className="text-right text-xs text-slate-400">
                        <p>{event.kind === "file_analysis" ? "파일 분석" : "텍스트 분석"}</p>
                        <p className="mt-1">{formatDateTime(event.created_at)}</p>
                      </div>
                    </div>
                  );
                })}
                {failedUsage.length === 0 && (
                  <div className="p-8">
                    <EmptyState text="이번 달 AI 분석 실패가 없습니다." />
                  </div>
                )}
              </div>
            </div>
          </section>

          <section
            id="requests"
            className="scroll-mt-6 rounded-3xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="border-b border-slate-100 p-5 sm:p-6">
              <SectionTitle
                eyebrow="Privacy operations"
                title="계정 삭제 요청"
                description="개인정보 삭제 요청의 접수와 처리 상태를 관리합니다."
              />
            </div>
            <div className="divide-y divide-slate-100">
              {deletionRequests.map((request) => {
                const profile = profileById.get(request.user_id);
                return (
                  <div
                    key={request.id}
                    className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-6"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar label={profile?.display_name ?? profile?.email ?? "U"} />
                      <div>
                        <p className="text-sm font-semibold">
                          {profile?.email ?? request.user_id}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {request.reason ?? "사유 미입력"} ·{" "}
                          {formatDateTime(request.requested_at)}
                        </p>
                      </div>
                    </div>
                    <form action={resolveDeletionRequest} className="flex gap-2">
                      <input type="hidden" name="requestId" value={request.id} />
                      <select
                        name="status"
                        defaultValue={request.status}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <option value="processing">처리 중</option>
                        <option value="completed">처리 완료</option>
                        <option value="canceled">요청 취소</option>
                      </select>
                      <button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                        반영
                      </button>
                    </form>
                  </div>
                );
              })}
              {deletionRequests.length === 0 && (
                <div className="p-8">
                  <EmptyState text="처리할 계정 삭제 요청이 없습니다." />
                </div>
              )}
            </div>
          </section>

          <p className="pb-4 text-center text-xs text-slate-400">
            xonote Operations Console · 관리자 작업은 서버 권한으로 검증됩니다.
          </p>
        </main>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 font-bold shadow-lg shadow-indigo-950/40">
      X
    </span>
  );
}

function AdminNav({
  href,
  icon,
  label,
  active = false,
}: {
  href: string;
  icon: string;
  label: string;
  active?: boolean;
}) {
  return (
    <a
      href={href}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
        active
          ? "bg-white text-slate-950"
          : "text-slate-400 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span className="grid h-6 w-6 place-items-center text-sm">{icon}</span>
      {label}
    </a>
  );
}

function SectionTitle({
  eyebrow,
  title,
  description,
  dark = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  dark?: boolean;
}) {
  return (
    <div>
      <p
        className={`text-xs font-bold uppercase tracking-[0.18em] ${
          dark ? "text-indigo-300" : "text-indigo-600"
        }`}
      >
        {eyebrow}
      </p>
      <h2
        className={`mt-1.5 text-lg font-bold ${
          dark ? "text-white" : "text-slate-950"
        }`}
      >
        {title}
      </h2>
      <p className={`mt-1 text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}>
        {description}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  accent,
  icon,
  compact = false,
}: {
  label: string;
  value: string;
  detail: string;
  accent: "indigo" | "emerald" | "violet" | "amber" | "rose" | "blue" | "slate";
  icon: string;
  compact?: boolean;
}) {
  const accentClasses = {
    indigo: "bg-indigo-50 text-indigo-600",
    emerald: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
    blue: "bg-blue-50 text-blue-600",
    slate: "bg-slate-100 text-slate-500",
  };

  return (
    <div className={`bg-white ${compact ? "p-5" : "p-5 sm:p-6"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p
            className={`mt-2 font-bold tracking-tight ${
              compact ? "text-2xl" : "text-3xl"
            }`}
          >
            {value}
          </p>
          <p className="mt-1.5 text-xs text-slate-400">{detail}</p>
        </div>
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl font-bold ${accentClasses[accent]}`}
        >
          {icon}
        </span>
      </div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  tone?: "slate" | "amber" | "rose" | "emerald";
}) {
  const toneClasses = {
    slate: "border-slate-200 bg-slate-50 text-slate-950",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  return (
    <div className={`rounded-2xl border p-4 ${toneClasses[tone]}`}>
      <p className="text-xs opacity-65">{label}</p>
      <p className="mt-1 text-xl font-bold">
        {typeof value === "number" ? value.toLocaleString("ko-KR") : value}
      </p>
    </div>
  );
}

function ActionItem({
  count,
  label,
  tone,
  href,
}: {
  count: number;
  label: string;
  tone: "rose" | "amber" | "violet" | "slate";
  href: string;
}) {
  const dotClasses = {
    rose: "bg-rose-400",
    amber: "bg-amber-400",
    violet: "bg-violet-400",
    slate: "bg-slate-400",
  };
  return (
    <a
      href={href}
      className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition hover:bg-white/10"
    >
      <span className="flex items-center gap-3 text-sm text-slate-200">
        <span className={`h-2.5 w-2.5 rounded-full ${dotClasses[tone]}`} />
        {label}
      </span>
      <span className="rounded-lg bg-white/10 px-2.5 py-1 text-sm font-bold">
        {count}
      </span>
    </a>
  );
}

function Avatar({ label }: { label: string }) {
  const initial = label.trim().charAt(0).toLocaleUpperCase("ko-KR") || "U";
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 text-sm font-bold text-indigo-700">
      {initial}
    </span>
  );
}

function Badge({
  label,
  tone,
}: {
  label: string;
  tone: "slate" | "blue" | "violet" | "emerald";
}) {
  const toneClasses = {
    slate: "bg-slate-100 text-slate-600",
    blue: "bg-blue-50 text-blue-700",
    violet: "bg-violet-50 text-violet-700",
    emerald: "bg-emerald-50 text-emerald-700",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${toneClasses[tone]}`}>
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "active" || status === "granted"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/10"
      : status === "pending" ||
          status === "past_due" ||
          status === "requested" ||
          status === "processing"
        ? "bg-amber-50 text-amber-700 ring-amber-600/10"
        : status === "suspended" || status === "withdrawn"
          ? "bg-rose-50 text-rose-700 ring-rose-600/10"
          : "bg-slate-100 text-slate-600 ring-slate-600/10";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${tone}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-7 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function formatWon(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("ko-KR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function relationshipLabel(value: GuardianLink["relationship"]) {
  if (value === "parent") return "부모";
  if (value === "legal_guardian") return "법정대리인";
  return "기타 보호자";
}

function failureLabel(reason: string | null) {
  if (!reason) return "원인이 기록되지 않은 분석 실패";
  const labels: Record<string, string> = {
    monthly_limit_reached: "월간 AI 사용량 초과",
    rate_limited: "짧은 시간 내 요청 과다",
    account_suspended: "이용 정지 계정",
    billing_not_configured: "AI 사용량 확인 설정 오류",
  };
  return labels[reason] ?? reason;
}
