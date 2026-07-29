import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canExportLearningData } from "@/lib/data-export-access";
import {
  createFamilyInvitation,
  requestAccountDeletion,
  sendFamilyInvitationEmail,
} from "./actions";
import { CopyInviteLinkButton } from "./copy-invite-link-button";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    success?: string;
    invite?: string;
    channel?: string;
    contact?: string;
  }>;
}) {
  const { error, success, invite, channel, contact } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: profile },
    { data: deletionRequest },
    { data: guardianLinks },
    { data: subscription },
    { data: plans },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "display_name, email, account_status, date_of_birth, country_code, guardian_required, guardian_consent_status, terms_accepted_at, privacy_accepted_at",
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("account_deletion_requests")
      .select("status, requested_at")
      .eq("user_id", user.id)
      .in("status", ["requested", "processing"])
      .maybeSingle(),
    supabase
      .from("guardian_links")
      .select(
        "id, child_user_id, guardian_user_id, relationship, status, can_view_learning, can_manage_account, can_manage_billing, accepted_at, created_at",
      )
      .or(`child_user_id.eq.${user.id},guardian_user_id.eq.${user.id}`)
      .order("created_at", { ascending: false }),
    supabase
      .from("subscriptions")
      .select("plan_id, status, current_period_start, current_period_end")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("plans").select("id, name").eq("is_active", true),
  ]);
  const exportAllowed = canExportLearningData(subscription);
  const currentPlan =
    plans?.find((plan) => plan.id === subscription?.plan_id) ??
    plans?.find((plan) => plan.id === "free");
  const now = new Date();
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end)
    : null;
  const subscriptionIsActive =
    (subscription?.status === "active" || subscription?.status === "trialing") &&
    Boolean(periodEnd && periodEnd.getTime() > now.getTime());
  const remainingDays =
    subscriptionIsActive && periodEnd
      ? Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / 86_400_000))
      : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">계정 설정</h1>
        <p className="mt-1 text-sm text-neutral-500">계정과 개인정보를 관리합니다.</p>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}
      {invite && (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 dark:border-indigo-900 dark:bg-indigo-950/40">
          <h2 className="font-semibold text-indigo-950 dark:text-indigo-100">초대 링크가 준비되었습니다</h2>
          <p className="mt-2 break-all rounded-lg bg-white p-3 text-sm text-indigo-800 dark:bg-neutral-950 dark:text-indigo-200">
            {invite}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {channel === "email" && contact && (
              <form action={sendFamilyInvitationEmail}>
                <input type="hidden" name="email" value={contact} />
                <input type="hidden" name="inviteUrl" value={invite} />
                <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
                  이메일로 전송하기
                </button>
              </form>
            )}
            <CopyInviteLinkButton inviteUrl={invite} />
          </div>
          <p className="mt-3 text-xs text-indigo-700 dark:text-indigo-300">
            링크는 7일 동안 한 번만 사용할 수 있습니다. 초대 대상에게만 전달해 주세요.
          </p>
        </section>
      )}

      <section aria-labelledby="settings-menu-title">
        <div>
          <h2 id="settings-menu-title" className="font-semibold">
            설정 메뉴
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            학습 과목과 이용 중인 요금제를 관리합니다.
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link
            href="/subjects"
            className="group rounded-xl border border-neutral-200 bg-white p-5 transition hover:border-indigo-300 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-indigo-700"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold">과목 관리</h3>
                <p className="mt-1 text-sm leading-6 text-neutral-500">
                  오답노트에서 사용할 과목을 추가하고 관리합니다.
                </p>
              </div>
              <span className="text-xl text-neutral-400 transition group-hover:translate-x-1 group-hover:text-indigo-600">
                →
              </span>
            </div>
          </Link>
          <Link
            href="/billing"
            className="group rounded-xl border border-neutral-200 bg-white p-5 transition hover:border-indigo-300 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-indigo-700"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold">요금제와 사용량</h3>
                <p className="mt-1 text-sm leading-6 text-neutral-500">
                  현재 요금제와 AI 분석 사용량을 확인합니다.
                </p>
              </div>
              <span className="text-xl text-neutral-400 transition group-hover:translate-x-1 group-hover:text-indigo-600">
                →
              </span>
            </div>
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
        <h2 className="font-semibold">내 계정</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-neutral-500">이름</dt>
            <dd className="mt-1 font-medium">{profile?.display_name ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">이메일</dt>
            <dd className="mt-1 font-medium">{profile?.email ?? user.email}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">계정 상태</dt>
            <dd className="mt-1 font-medium">
              {profile?.account_status === "suspended" ? "이용 정지" : "정상"}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">이용 요금제</dt>
            <dd className="mt-1 font-medium">{currentPlan?.name ?? "Free"}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">요금제 상태</dt>
            <dd className="mt-1 font-medium">
              {subscriptionStatusLabel(subscription?.status)}
              {subscriptionIsActive && remainingDays > 0 ? ` · D-${remainingDays}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">30일 활성기간</dt>
            <dd className="mt-1 font-medium">
              {subscriptionIsActive &&
              subscription?.current_period_start &&
              subscription.current_period_end
                ? `${formatSubscriptionDate(subscription.current_period_start)} ~ ${formatSubscriptionDate(subscription.current_period_end)}`
                : "활성 구독 없음"}
            </dd>
          </div>
        </dl>
        <div className="mt-5 flex flex-wrap gap-3">
          {exportAllowed ? (
            <a
              href="/api/account/export"
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              내 학습 데이터 내려받기
            </a>
          ) : (
            <span
              aria-disabled="true"
              className="cursor-not-allowed rounded-md border border-neutral-200 bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900"
            >
              내 학습 데이터 내려받기 · 승인 필요
            </span>
          )}
          <Link href="/billing" className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium">
            요금제 관리
          </Link>
        </div>
        {!exportAllowed && (
          <p className="mt-3 text-xs leading-5 text-amber-700 dark:text-amber-300">
            유료 이용 신청과 결제 확인 후 운영자가 권한을 승인하면 내려받을 수 있습니다.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
        <h2 className="font-semibold">보호자 계정</h2>
        <p className="mt-2 text-sm text-neutral-500">
          미성년 학습자는 보호자가 학습 현황, 계정과 결제를 각각 허용된 범위에서 관리합니다.
        </p>

        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-neutral-500">생년월일</dt>
            <dd className="mt-1 font-medium">{profile?.date_of_birth ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">거주 국가</dt>
            <dd className="mt-1 font-medium">{profile?.country_code ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">보호자 동의</dt>
            <dd className="mt-1 font-medium">
              {profile?.guardian_required
                ? profile.guardian_consent_status
                : "필요 없음"}
            </dd>
          </div>
        </dl>

        <div className="mt-5 space-y-3">
          {(guardianLinks ?? []).length > 0 ? (
            guardianLinks?.map((link) => {
              const isGuardian = link.guardian_user_id === user.id;
              return (
                <div
                  key={link.id}
                  className="rounded-lg bg-neutral-50 p-3 text-sm dark:bg-neutral-900"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">
                      {isGuardian ? "관리 중인 학습자" : "연결된 보호자"}
                    </span>
                    <span className="text-neutral-500">{link.status}</span>
                  </div>
                  <p className="mt-2 text-xs text-neutral-500">
                    학습 열람 {link.can_view_learning ? "허용" : "차단"} · 계정 관리{" "}
                    {link.can_manage_account ? "허용" : "차단"} · 결제 관리{" "}
                    {link.can_manage_billing ? "허용" : "차단"}
                  </p>
                </div>
              );
            })
          ) : (
            <p className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-500 dark:bg-neutral-900">
              연결된 보호자 계정이 없습니다. 보호자 초대와 본인 확인 기능은 결제·메일 제공자 연결 후
              활성화됩니다.
            </p>
          )}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {profile?.guardian_required && (
            <form action={createFamilyInvitation} className="space-y-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
              <input type="hidden" name="direction" value="child_invites_guardian" />
              <div>
                <h3 className="font-semibold">보호자 초대</h3>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  보호자에게 이메일이나 문자로 승인 링크를 보냅니다.
                </p>
              </div>
              <InviteContactFields />
              <label className="block text-sm">
                <span className="font-medium">관계</span>
                <select name="relationship" className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
                  <option value="parent">부모</option>
                  <option value="legal_guardian">법정대리인</option>
                  <option value="other">기타 보호자</option>
                </select>
              </label>
              <button className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-neutral-900">
                보호자 초대 링크 만들기
              </button>
            </form>
          )}

          {!profile?.guardian_required && (
            <form action={createFamilyInvitation} className="space-y-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
              <input type="hidden" name="direction" value="guardian_invites_child" />
              <div>
                <h3 className="font-semibold">자녀 연결 또는 계정 생성</h3>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  기존 자녀에게 연결 링크를 보내거나, 이메일 초대로 새 자녀 계정을 만듭니다.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium">자녀 이름</span>
                  <input name="childName" required className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900" />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">자녀 생년월일</span>
                  <input name="childDateOfBirth" type="date" required max={new Date().toISOString().slice(0, 10)} className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900" />
                </label>
              </div>
              <InviteContactFields />
              <p className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
                이메일 전송 시 가입 여부를 자동 확인합니다. 신규 이메일은 자녀 계정을 만들고,
                기존 회원은 이메일 인증 후 현재 계정에 바로 연결됩니다.
              </p>
              <input type="hidden" name="relationship" value="parent" />
              <button className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-neutral-900">
                자녀 초대 시작하기
              </button>
            </form>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
        <h2 className="font-semibold">약관과 개인정보</h2>
        <p className="mt-2 text-sm text-neutral-500">
          서비스 이용에 적용되는 문서와 데이터 처리 내용을 확인할 수 있습니다.
        </p>
        <div className="mt-4 flex gap-4 text-sm">
          <Link href="/terms" className="underline">이용약관</Link>
          <Link href="/privacy" className="underline">개인정보 처리방침</Link>
        </div>
      </section>

      <section className="rounded-xl border border-red-200 p-5 dark:border-red-900">
        <h2 className="font-semibold text-red-700 dark:text-red-300">계정 삭제</h2>
        {deletionRequest ? (
          <p className="mt-2 text-sm text-neutral-500">
            {new Date(deletionRequest.requested_at).toLocaleDateString("ko-KR")}에 요청했으며 현재 상태는{" "}
            <strong>{deletionRequest.status}</strong>입니다.
          </p>
        ) : (
          <form action={requestAccountDeletion} className="mt-4 space-y-3">
            <p className="text-sm text-neutral-500">
              요청이 접수되면 관리자가 구독과 데이터를 확인한 뒤 삭제를 처리합니다.
            </p>
            <textarea
              name="reason"
              rows={2}
              placeholder="탈퇴 사유 (선택)"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <input
              name="confirmation"
              required
              placeholder="'계정 삭제 요청' 입력"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <button className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500">
              삭제 요청 접수
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

function InviteContactFields() {
  return (
    <div className="space-y-3">
      <input type="hidden" name="channel" value="email" />
      <label className="block text-sm">
        <span className="font-medium">보호자 이메일</span>
        <input
          name="email"
          type="email"
          required
          placeholder="guardian@example.com"
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>
      <p className="text-xs text-neutral-500">
        링크 생성 후 이메일로 바로 보내거나 공유링크를 복사할 수 있습니다.
      </p>
    </div>
  );
}

function Notice({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  return (
    <p
      className={`rounded-md px-4 py-3 text-sm ${
        tone === "error"
          ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
          : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      }`}
    >
      {children}
    </p>
  );
}

function subscriptionStatusLabel(status?: string) {
  const labels: Record<string, string> = {
    active: "활성",
    trialing: "체험 중",
    past_due: "결제 확인 필요",
    paused: "일시 정지",
    canceled: "해지",
  };
  return status ? (labels[status] ?? status) : "무료";
}

function formatSubscriptionDate(value: string) {
  return new Date(value).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
