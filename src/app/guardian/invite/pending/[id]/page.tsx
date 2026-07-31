import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { acceptFamilyInvitation } from "../../[token]/actions";

export default async function PendingFamilyInvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  const { error, message } = await searchParams;
  const next = `/guardian/invite/pending/${id}`;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);

  const admin = createAdminClient();
  const { data: invitation } = await admin
    .from("family_invitations")
    .select("id, direction, invitee_email, child_name, relationship, status, expires_at")
    .eq("id", id)
    .maybeSingle();
  const emailMatches =
    invitation?.invitee_email?.trim().toLowerCase() === user.email?.trim().toLowerCase();
  const currentTime = new Date().getTime();
  const isPending =
    emailMatches
    && invitation?.status === "pending"
    && new Date(invitation.expires_at).getTime() > currentTime;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-10">
      <section className="w-full rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <Link href="/" className="text-lg font-bold">xonote</Link>
        <h1 className="mt-8 text-2xl font-bold">보호자·자녀 연결 확인</h1>

        {message && (
          <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            {message}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {emailMatches && invitation?.status === "accepted" ? (
          <div className="mt-6 rounded-xl bg-emerald-50 p-5 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            <p className="font-semibold">보호자와 자녀 계정 연결이 완료되었습니다.</p>
            <Link href="/settings" className="mt-3 inline-block font-semibold underline">연결 정보 확인하기</Link>
          </div>
        ) : !isPending ? (
          <div className="mt-6">
            <p className="rounded-lg bg-neutral-100 p-4 text-sm text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
              연결 요청이 만료되었거나 현재 로그인한 이메일과 일치하지 않습니다.
            </p>
            <Link href="/settings" className="mt-4 inline-block font-semibold text-indigo-600">설정으로 이동</Link>
          </div>
        ) : (
          <form action={acceptFamilyInvitation} className="mt-6 space-y-5">
            <input type="hidden" name="invitationId" value={id} />
            <div className="rounded-xl bg-neutral-50 p-4 text-sm dark:bg-neutral-900">
              <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                이메일 인증이 완료되었습니다. 아래 연결 내용을 확인해 주세요.
              </p>
              <p className="mt-3"><strong>연결 유형:</strong>{" "}
                {invitation.direction === "child_invites_guardian"
                  ? "학습자의 보호자로 연결"
                  : `${invitation.child_name ?? "자녀"} 계정과 보호자로 연결`}
              </p>
              <p className="mt-2"><strong>현재 로그인:</strong> {user.email}</p>
              <p className="mt-2"><strong>관계:</strong> {relationshipLabel(invitation.relationship)}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 p-4 text-sm leading-6 dark:border-neutral-800">
              <h2 className="font-semibold">보호자 권한 및 동의 내용</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-neutral-600 dark:text-neutral-300">
                <li>자녀의 과목, 오답노트와 복습 현황 열람</li>
                <li>자녀 계정의 안전 설정 및 구독·결제 관리</li>
                <li>연결 및 관리 활동 기록 보관</li>
                <li>설정 화면에서 연결 철회 요청 가능</li>
              </ul>
            </div>
            <label className="flex items-start gap-3 rounded-xl bg-indigo-50 p-4 text-sm dark:bg-indigo-950/40">
              <input name="guardianConsent" type="checkbox" required className="mt-1" />
              <span>위 내용을 확인했으며 보호자 동의 및 계정 연결을 승인합니다.</span>
            </label>
            <div className="space-y-2 text-sm">
              <label className="flex items-start gap-2">
                <input name="agreeTerms" type="checkbox" required className="mt-1" />
                <span><Link href="/terms" target="_blank" className="underline">이용약관</Link>에 동의합니다.</span>
              </label>
              <label className="flex items-start gap-2">
                <input name="agreePrivacy" type="checkbox" required className="mt-1" />
                <span><Link href="/privacy" target="_blank" className="underline">개인정보 처리방침</Link>에 동의합니다.</span>
              </label>
            </div>
            <button className="w-full rounded-lg bg-neutral-900 px-4 py-3 font-semibold text-white dark:bg-white dark:text-neutral-900">
              확인하고 계정 연결하기
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function relationshipLabel(value: string) {
  if (value === "legal_guardian") return "법정대리인";
  if (value === "other") return "기타 보호자";
  return "부모";
}
