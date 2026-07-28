import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveDeletionRequest, updateAccountStatus, updateUserPlan } from "./actions";

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  account_status: "active" | "suspended";
  created_at: string;
};

type Subscription = {
  user_id: string;
  plan_id: string;
  status: string;
};

type Plan = { id: string; name: string };

type DeletionRequest = {
  id: string;
  user_id: string;
  reason: string | null;
  status: string;
  requested_at: string;
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.app_metadata?.role !== "admin") redirect("/dashboard");

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [
    { data: profiles },
    { data: subscriptions },
    { data: plans },
    { data: usageEvents },
    { data: deletionRequests },
  ] = await Promise.all([
    supabase.from("profiles").select("id, email, display_name, account_status, created_at").order("created_at", {
      ascending: false,
    }),
    supabase.from("subscriptions").select("user_id, plan_id, status"),
    supabase.from("plans").select("id, name").eq("is_active", true).order("sort_order"),
    supabase
      .from("usage_events")
      .select("user_id, units, input_tokens, output_tokens, status")
      .gte("created_at", monthStart.toISOString()),
    supabase
      .from("account_deletion_requests")
      .select("id, user_id, reason, status, requested_at")
      .in("status", ["requested", "processing"])
      .order("requested_at"),
  ]);

  const profileList = (profiles as Profile[] | null) ?? [];
  const subscriptionList = (subscriptions as Subscription[] | null) ?? [];
  const planList = (plans as Plan[] | null) ?? [];
  const deletionList = (deletionRequests as DeletionRequest[] | null) ?? [];
  const succeededUsage = (usageEvents ?? []).filter((event) => event.status === "succeeded");
  const totalAiUsage = succeededUsage.reduce((sum, event) => sum + Number(event.units), 0);
  const inputTokens = succeededUsage.reduce((sum, event) => sum + Number(event.input_tokens ?? 0), 0);
  const outputTokens = succeededUsage.reduce((sum, event) => sum + Number(event.output_tokens ?? 0), 0);

  const subscriptionsByUser = new Map(subscriptionList.map((item) => [item.user_id, item]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">서비스 관리자</h1>
        <p className="mt-1 text-sm text-neutral-500">사용자, 구독, AI 사용량과 삭제 요청을 관리합니다.</p>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="전체 사용자" value={profileList.length.toLocaleString("ko-KR")} />
        <Metric
          label="유료 활성 구독"
          value={subscriptionList.filter((item) => item.plan_id !== "free" && item.status === "active").length.toString()}
        />
        <Metric label="이번 달 AI 분석" value={`${totalAiUsage.toLocaleString("ko-KR")}회`} />
        <Metric
          label="이번 달 토큰"
          value={`${(inputTokens + outputTokens).toLocaleString("ko-KR")}`}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">사용자와 구독</h2>
        <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-4 py-3">사용자</th>
                <th className="px-4 py-3">가입일</th>
                <th className="px-4 py-3">계정 상태</th>
                <th className="px-4 py-3">플랜 / 구독</th>
              </tr>
            </thead>
            <tbody>
              {profileList.map((profile) => {
                const subscription = subscriptionsByUser.get(profile.id);
                return (
                  <tr key={profile.id} className="border-t border-neutral-200 dark:border-neutral-800">
                    <td className="px-4 py-3">
                      <p className="font-medium">{profile.display_name ?? "이름 없음"}</p>
                      <p className="text-xs text-neutral-500">{profile.email ?? profile.id}</p>
                    </td>
                    <td className="px-4 py-3 text-neutral-500">
                      {new Date(profile.created_at).toLocaleDateString("ko-KR")}
                    </td>
                    <td className="px-4 py-3">
                      <form action={updateAccountStatus} className="flex gap-2">
                        <input type="hidden" name="userId" value={profile.id} />
                        <select
                          name="accountStatus"
                          defaultValue={profile.account_status}
                          className="rounded-md border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700"
                        >
                          <option value="active">active</option>
                          <option value="suspended">suspended</option>
                        </select>
                        <button className="rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700">
                          저장
                        </button>
                      </form>
                    </td>
                    <td className="px-4 py-3">
                      <form action={updateUserPlan} className="flex gap-2">
                        <input type="hidden" name="userId" value={profile.id} />
                        <select
                          name="planId"
                          defaultValue={subscription?.plan_id ?? "free"}
                          className="rounded-md border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700"
                        >
                          {planList.map((plan) => (
                            <option key={plan.id} value={plan.id}>{plan.name}</option>
                          ))}
                        </select>
                        <select
                          name="status"
                          defaultValue={subscription?.status ?? "active"}
                          className="rounded-md border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700"
                        >
                          <option value="active">active</option>
                          <option value="trialing">trialing</option>
                          <option value="past_due">past_due</option>
                          <option value="paused">paused</option>
                          <option value="canceled">canceled</option>
                        </select>
                        <button className="rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700">
                          저장
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">계정 삭제 요청</h2>
        {deletionList.length === 0 ? (
          <p className="rounded-xl border border-neutral-200 p-5 text-sm text-neutral-500 dark:border-neutral-800">
            처리할 요청이 없습니다.
          </p>
        ) : (
          <div className="space-y-3">
            {deletionList.map((request) => {
              const profile = profileList.find((item) => item.id === request.user_id);
              return (
                <div
                  key={request.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
                >
                  <div>
                    <p className="font-medium">{profile?.email ?? request.user_id}</p>
                    <p className="mt-1 text-sm text-neutral-500">{request.reason ?? "사유 없음"}</p>
                  </div>
                  <form action={resolveDeletionRequest} className="flex gap-2">
                    <input type="hidden" name="requestId" value={request.id} />
                    <select
                      name="status"
                      defaultValue={request.status}
                      className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
                    >
                      <option value="processing">processing</option>
                      <option value="completed">completed</option>
                      <option value="canceled">canceled</option>
                    </select>
                    <button className="rounded-md bg-neutral-900 px-3 py-2 text-sm text-white dark:bg-white dark:text-neutral-900">
                      반영
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
