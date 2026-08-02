import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canExportLearningData } from "@/lib/data-export-access";
import {
  createFamilyInvitation,
  removeChildConnection,
  sendFamilyInvitationEmail,
} from "./actions";
import { CopyInviteLinkButton } from "./copy-invite-link-button";
import { BirthDateInput } from "./birth-date-input";
import { InviteEmailVerification } from "./invite-email-verification";
import { RemoveChildConnectionButton } from "./remove-child-connection-button";
import { SupportAndAccountActions } from "./support-and-account-actions";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    success?: string;
    invite?: string;
    channel?: string;
    contact?: string;
    panel?: string;
  }>;
}) {
  const { error, success, invite, channel, contact, panel } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const next = panel === "support" ? "/settings?panel=support" : "/settings";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  const admin = createAdminClient();

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
      .neq("status", "revoked")
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
  const relatedUserIds = Array.from(
    new Set(
      (guardianLinks ?? []).map((link) =>
        link.guardian_user_id === user.id
          ? link.child_user_id
          : link.guardian_user_id,
      ),
    ),
  );
  const { data: relatedProfiles } = relatedUserIds.length
    ? await admin
        .from("profiles")
        .select("id, display_name, email")
        .in("id", relatedUserIds)
    : { data: [] };
  const relatedProfileById = new Map(
    (relatedProfiles ?? []).map((relatedProfile) => [
      relatedProfile.id,
      relatedProfile,
    ]),
  );
  const { data: incomingInvitations } = user.email
    ? await admin
        .from("family_invitations")
        .select("id, direction, child_name, created_at")
        .ilike("invitee_email", user.email.trim().toLowerCase())
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">계정 설정</h1>
        <p className="mt-1 text-sm text-neutral-500">계정과 개인정보를 관리합니다.</p>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}
      {(incomingInvitations ?? []).length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/40">
          <h2 className="font-semibold text-amber-950 dark:text-amber-100">확인이 필요한 계정 연결 요청이 있습니다.</h2>
          <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
            이메일 확인만으로는 연결되지 않습니다. 연결 내용을 확인하고 직접 승인해 주세요.
          </p>
          <div className="mt-3 space-y-2">
            {incomingInvitations?.map((invitation) => (
              <Link
                key={invitation.id}
                href={`/guardian/invite/pending/${invitation.id}`}
                className="block rounded-lg bg-white px-4 py-3 text-sm font-semibold text-amber-900 underline dark:bg-neutral-950 dark:text-amber-100"
              >
                {invitation.direction === "child_invites_guardian"
                  ? "보호자 연결 요청 확인하기"
                  : `${invitation.child_name ?? "자녀"} 계정 연결 요청 확인하기`}
              </Link>
            ))}
          </div>
        </section>
      )}
      {invite && (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 dark:border-indigo-900 dark:bg-indigo-950/40">
          <h2 className="font-semibold text-indigo-950 dark:text-indigo-100">초대 링크 및 발송 결과</h2>
          <p className="mt-2 break-all rounded-lg bg-white p-3 text-sm text-indigo-800 dark:bg-neutral-950 dark:text-indigo-200">
            {invite}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {channel === "email" && contact && (
              <form action={sendFamilyInvitationEmail}>
                <input type="hidden" name="email" value={contact} />
                <input type="hidden" name="inviteUrl" value={invite} />
                <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
                  이메일 다시 전송하기
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
              const relatedUserId = isGuardian
                ? link.child_user_id
                : link.guardian_user_id;
              const relatedProfile = relatedProfileById.get(relatedUserId);
              return (
                <div
                  key={link.id}
                  className="rounded-lg bg-neutral-50 p-3 text-sm dark:bg-neutral-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-xs font-medium text-neutral-500">
                        {isGuardian ? "관리 중인 학습자" : "연결된 보호자"}
                      </span>
                      <p className="mt-1 font-semibold text-neutral-950 dark:text-neutral-50">
                        {relatedProfile?.display_name ?? "이름 미등록"}
                      </p>
                      <p className="mt-1 break-all text-xs text-neutral-600 dark:text-neutral-400">
                        {relatedProfile?.email ?? "이메일 미등록"}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs text-neutral-500 dark:bg-neutral-800">
                      {link.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-neutral-500">
                    학습 열람 {link.can_view_learning ? "허용" : "차단"} · 계정 관리{" "}
                    {link.can_manage_account ? "허용" : "차단"} · 결제 관리{" "}
                    {link.can_manage_billing ? "허용" : "차단"}
                  </p>
                  {isGuardian && link.status === "active" && (
                    <form action={removeChildConnection} className="mt-3 flex justify-end">
                      <input type="hidden" name="linkId" value={link.id} />
                      <RemoveChildConnectionButton
                        childName={relatedProfile?.display_name ?? "연결된 자녀"}
                      />
                    </form>
                  )}
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
                <h3 className="font-semibold">보호자 초대 및 동의(미성년 회원)</h3>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  보호자 이메일의 가입 여부와 중복 연결을 확인한 후 동의 링크를 보냅니다.
                </p>
              </div>
              <label className="block text-sm">
                <span className="font-medium">관계</span>
                <select name="relationship" className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
                  <option value="parent">부모</option>
                  <option value="legal_guardian">법정대리인</option>
                  <option value="other">기타 보호자</option>
                </select>
              </label>
              <InviteEmailVerification
                type="guardian"
                direction="child_invites_guardian"
                submitLabel="보호자 동의 이메일 발송"
              />
            </form>
          )}

          {!profile?.guardian_required && (
            <form action={createFamilyInvitation} className="space-y-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
              <input type="hidden" name="direction" value="guardian_invites_child" />
              <div>
                <h3 className="font-semibold">자녀 초대(부모님회원)</h3>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  미성년 자녀 이메일의 가입 여부와 중복 연결을 확인한 후 초대 링크를 보냅니다.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium">자녀 이름</span>
                  <input name="childName" required className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900" />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">자녀 생년월일</span>
                  <BirthDateInput />
                </label>
              </div>
              <p className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
                기존 회원에게는 연결 동의 링크를 보내고, 미가입 이메일에는 회원가입이 포함된
                초대 링크를 보냅니다. 이메일 인증과 동의 전에는 연결되지 않습니다.
              </p>
              <input type="hidden" name="relationship" value="parent" />
              <InviteEmailVerification
                type="child"
                direction="guardian_invites_child"
                submitLabel="자녀 초대 이메일 발송"
              />
            </form>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
        <h2 className="font-semibold">이용 지원과 계정</h2>
        <p className="mt-2 text-sm text-neutral-500">
          서비스 이용 문의를 확인하거나 계정 삭제를 요청할 수 있습니다.
        </p>
        <SupportAndAccountActions
          initialPanel={panel === "support" ? "support" : null}
          deletionRequest={
            deletionRequest
              ? {
                  requestedAt: deletionRequest.requested_at,
                  status: deletionRequest.status,
                }
              : null
          }
        />
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
