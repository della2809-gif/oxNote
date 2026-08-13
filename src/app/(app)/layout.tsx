import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signOut } from "../(auth)/actions";
import { NotificationBell, type HeaderNotification } from "./notification-bell";

const NAV_LINKS = [
  { href: "/dashboard", label: "홈" },
  { href: "/notes", label: "오답노트" },
  { href: "/review", label: "복습하기" },
  { href: "/settings", label: "설정" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  const isAdmin = user.app_metadata?.role === "admin";
  const now = new Date();
  const admin = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : null;
  const [
    dueReviewsResult,
    nextReviewResult,
    subscriptionResult,
    guardianLinksResult,
    incomingInvitationsResult,
    outgoingInvitationsResult,
    profileResult,
  ] = await Promise.all([
    supabase
      .from("notes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .lte("next_review_at", now.toISOString()),
    supabase
      .from("notes")
      .select("next_review_at")
      .eq("user_id", user.id)
      .gt("next_review_at", now.toISOString())
      .order("next_review_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("subscriptions")
      .select("plan_id, status, current_period_end, cancel_at_period_end")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("guardian_links")
      .select("id, status")
      .or(`child_user_id.eq.${user.id},guardian_user_id.eq.${user.id}`)
      .eq("status", "active"),
    user.email && admin
      ? admin
          .from("family_invitations")
          .select("id, direction, child_name", { count: "exact" })
          .ilike("invitee_email", user.email.trim().toLowerCase())
          .eq("status", "pending")
          .gt("expires_at", now.toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [], count: 0, error: null }),
    admin
      ? admin
          .from("family_invitations")
          .select("id")
          .eq("inviter_user_id", user.id)
          .eq("status", "pending")
          .gt("expires_at", now.toISOString())
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const displayName = profileResult.data?.display_name?.trim() || "회원";

  const notifications: HeaderNotification[] = [];
  const dueReviewCount = dueReviewsResult.count ?? 0;
  if (dueReviewCount > 0) {
    notifications.push({
      id: "reviews-due",
      category: "복습",
      title: `오늘 복습할 문제가 ${dueReviewCount}개 있어요`,
      description: "복습 결과를 기록하면 다음 복습일이 자동으로 조정됩니다.",
      href: "/review",
      actionable: true,
      tone: "indigo",
    });
  } else if (nextReviewResult.data?.next_review_at) {
    notifications.push({
      id: "next-review",
      category: "복습",
      title: `다음 복습은 ${formatNotificationDate(nextReviewResult.data.next_review_at)}예요`,
      description: "현재 밀린 복습은 없습니다. 다음 일정을 미리 확인할 수 있어요.",
      href: "/review",
      tone: "emerald",
    });
  }

  const subscription = subscriptionResult.data;
  if (subscription?.status === "past_due") {
    notifications.push({
      id: "billing-past-due",
      category: "결제",
      title: "결제 확인이 필요합니다",
      description: "결제 상태를 확인하고 서비스 이용 중단을 예방해 주세요.",
      href: "/billing",
      actionable: true,
      tone: "red",
    });
  } else if (subscription?.cancel_at_period_end) {
    notifications.push({
      id: "billing-canceling",
      category: "결제",
      title: "구독 해지가 예정되어 있습니다",
      description: subscription.current_period_end
        ? `${formatNotificationDate(subscription.current_period_end)}까지 현재 요금제를 이용할 수 있습니다.`
        : "결제 페이지에서 구독 종료 일정을 확인해 주세요.",
      href: "/billing",
      actionable: true,
      tone: "amber",
    });
  } else if (subscription) {
    notifications.push({
      id: "billing-status",
      category: "결제",
      title: subscription.plan_id === "free" ? "무료 플랜을 이용 중입니다" : "구독이 정상적으로 이용 중입니다",
      description: subscription.current_period_end
        ? `현재 이용 기간은 ${formatNotificationDate(subscription.current_period_end)}까지입니다.`
        : "결제 페이지에서 요금제와 사용량을 확인할 수 있습니다.",
      href: "/billing",
      tone: "emerald",
    });
  }

  const incomingInvitation = incomingInvitationsResult.data?.[0];
  if (incomingInvitation) {
    notifications.push({
      id: `incoming-family-${incomingInvitation.id}`,
      category: "보호자 연결",
      title: "확인이 필요한 계정 연결 요청이 있습니다",
      description: incomingInvitation.direction === "child_invites_guardian"
        ? "보호자 연결 내용을 확인하고 동의해 주세요."
        : `${incomingInvitation.child_name ?? "자녀"} 계정 연결 내용을 확인해 주세요.`,
      href: `/guardian/invite/pending/${incomingInvitation.id}`,
      actionable: true,
      dismissible: true,
      tone: "amber",
    });
  }
  const outgoingInvitationIds = (outgoingInvitationsResult.data ?? [])
    .map((invitation) => invitation.id)
    .sort();
  const outgoingInvitationCount = outgoingInvitationIds.length;
  if (outgoingInvitationCount > 0) {
    notifications.push({
      id: `outgoing-family-${outgoingInvitationIds.join("-")}`,
      category: "보호자 연결",
      title: `상대방 확인을 기다리는 초대가 ${outgoingInvitationCount}건 있습니다`,
      description: "설정에서 초대 링크를 다시 보내거나 연결 상태를 확인할 수 있습니다.",
      href: "/settings",
      dismissible: true,
      tone: "indigo",
    });
  } else if ((guardianLinksResult.data?.length ?? 0) > 0) {
    const guardianLinkIds = (guardianLinksResult.data ?? [])
      .map((link) => link.id)
      .sort();
    notifications.push({
      id: `active-family-links-${guardianLinkIds.join("-")}`,
      category: "보호자 연결",
      title: `보호자·자녀 계정 ${guardianLinksResult.data?.length ?? 0}개가 연결되어 있습니다`,
      description: "학습 열람과 계정·결제 관리 권한을 설정에서 확인할 수 있습니다.",
      href: "/settings",
      dismissible: true,
      tone: "emerald",
    });
  }

  return (
    <div className="min-h-screen w-full min-w-0 overflow-x-clip bg-slate-50 dark:bg-neutral-950">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <div className="mx-auto flex w-full max-w-[1500px] min-w-0 flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-6">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-3">
            <Link
              href="/dashboard"
              className="text-lg font-bold tracking-tight text-slate-950 dark:text-white"
            >
              xonote
            </Link>
            <nav className="order-3 flex w-full min-w-0 gap-4 overflow-x-auto pb-1 text-sm [scrollbar-width:none] sm:order-none sm:w-auto sm:flex-wrap sm:overflow-visible sm:pb-0">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="inline-flex min-h-11 shrink-0 items-center text-slate-600 transition hover:text-slate-950 dark:text-neutral-400 dark:hover:text-white"
                >
                  {link.label}
                </Link>
              ))}
              {isAdmin && (
                <Link
                  href="/admin"
                  className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap font-semibold text-indigo-600 transition hover:text-indigo-500 dark:text-indigo-400"
                >
                  운영자 콘솔
                </Link>
              )}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            <NotificationBell
              notifications={notifications}
              storageKey={`xonote:dismissed-notifications:${user.id}`}
            />
            <form action={signOut} className="flex items-center gap-3">
              <span className="hidden max-w-[220px] truncate text-sm font-medium text-slate-600 sm:block dark:text-neutral-300">
                {displayName}
              </span>
              <button
                type="submit"
                className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
              >
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1500px] min-w-0 overflow-x-clip px-3 py-5 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}

function formatNotificationDate(value: string) {
  return new Date(value).toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
  });
}
