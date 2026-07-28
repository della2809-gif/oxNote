import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Plan = {
  id: string;
  name: string;
  description: string;
  monthly_price_krw: number;
  monthly_ai_credits: number;
  max_file_bytes: number;
  monthly_storage_bytes: number;
};

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [{ data: plans }, { data: subscription }, { data: usageEvents }, { data: uploadedNotes }] = await Promise.all([
    supabase.from("plans").select("*").eq("is_active", true).order("sort_order"),
    supabase
      .from("subscriptions")
      .select("status, plan_id, current_period_end, cancel_at_period_end")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("usage_events")
      .select("units")
      .eq("user_id", user.id)
      .in("status", ["reserved", "succeeded"])
      .gte("created_at", monthStart.toISOString()),
    supabase
      .from("notes")
      .select("source_file_size_bytes")
      .gte("created_at", monthStart.toISOString())
      .not("source_file_size_bytes", "is", null),
  ]);

  const planList = ((plans as Plan[] | null) ?? []).length
    ? ((plans as Plan[] | null) ?? [])
    : [
        {
          id: "free",
          name: "Free",
          description: "가볍게 시작하는 무료 플랜",
          monthly_price_krw: 0,
          monthly_ai_credits: 10,
          max_file_bytes: 5 * 1024 * 1024,
          monthly_storage_bytes: 50 * 1024 * 1024,
        },
      ];
  const currentPlanId =
    subscription?.status === "active" || subscription?.status === "trialing"
      ? subscription.plan_id
      : "free";
  const currentPlan = planList.find((plan) => plan.id === currentPlanId) ?? planList[0];
  const used = (usageEvents ?? []).reduce((sum, event) => sum + Number(event.units), 0);
  const limit = currentPlan.monthly_ai_credits;
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const checkoutUrl = process.env.PAYMENT_CHECKOUT_URL;
  const uploadedBytes = (uploadedNotes ?? []).reduce(
    (sum, note) => sum + Number(note.source_file_size_bytes ?? 0),
    0,
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">요금제와 사용량</h1>
        <p className="mt-1 text-sm text-neutral-500">
          AI 분석 사용량과 현재 구독 상태를 확인합니다.
        </p>
      </div>

      <section className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-neutral-500">현재 플랜</p>
            <p className="mt-1 text-2xl font-semibold">{currentPlan.name}</p>
            {subscription?.cancel_at_period_end && (
              <p className="mt-1 text-sm text-amber-600">
                현재 결제 기간이 끝나면 구독이 해지됩니다.
              </p>
            )}
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            {subscription?.status ?? "free"}
          </span>
        </div>
        <div className="mt-6">
          <div className="flex justify-between text-sm">
            <span>이번 달 AI 분석</span>
            <span className="font-medium">
              {used} / {limit}회
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
            <div className="h-full rounded-full bg-indigo-600" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            실패한 AI 요청은 월 사용량에 포함되지 않습니다.
          </p>
          <p className="mt-3 text-xs text-neutral-500">
            이번 달 파일 업로드: {Math.ceil(uploadedBytes / 1024 / 1024)}MB /{" "}
            {Math.floor(currentPlan.monthly_storage_bytes / 1024 / 1024)}MB
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {planList.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          return (
            <div
              key={plan.id}
              className={`rounded-xl border p-5 ${
                isCurrent
                  ? "border-indigo-500 ring-1 ring-indigo-500"
                  : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{plan.name}</h2>
                  <p className="mt-1 text-sm text-neutral-500">{plan.description}</p>
                </div>
                {isCurrent && (
                  <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    이용 중
                  </span>
                )}
              </div>
              <p className="mt-5 text-2xl font-semibold">
                {plan.monthly_price_krw === 0
                  ? "무료"
                  : `월 ${plan.monthly_price_krw.toLocaleString("ko-KR")}원`}
              </p>
              <ul className="mt-4 space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
                <li>AI 분석 월 {plan.monthly_ai_credits}회</li>
                <li>파일당 최대 {Math.floor(plan.max_file_bytes / 1024 / 1024)}MB</li>
                <li>원본 파일 월 {Math.floor(plan.monthly_storage_bytes / 1024 / 1024)}MB</li>
              </ul>
              {!isCurrent && plan.id !== "free" && (
                checkoutUrl ? (
                  <a
                    href={checkoutUrl}
                    className="mt-5 block rounded-md bg-neutral-900 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
                  >
                    Pro 시작하기
                  </a>
                ) : (
                  <p className="mt-5 rounded-md bg-neutral-100 px-4 py-2.5 text-center text-sm text-neutral-500 dark:bg-neutral-900">
                    결제 오픈 준비 중
                  </p>
                )
              )}
            </div>
          );
        })}
      </section>

      <p className="text-sm text-neutral-500">
        결제·환불 관련 내용은 <Link href="/terms" className="underline">이용약관</Link>에서 확인할 수
        있습니다.
      </p>
    </div>
  );
}
