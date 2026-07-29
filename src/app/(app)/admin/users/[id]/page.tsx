import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  resetManagedUserPassword,
  updateGuardianLink,
  updateManagedUser,
  updateUserPlan,
} from "../../actions";

export default async function ManagedUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { id } = await params;
  const { error, success } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.app_metadata?.role !== "admin") redirect("/dashboard");

  const [
    { data: profile },
    { data: subscription },
    { data: plans },
    { count: notesCount },
    { count: reviewCount },
    { data: guardianLinks },
  ] = await Promise.all([
    supabase.from("profiles").select("id, email, display_name, account_status, date_of_birth, country_code, guardian_required, guardian_consent_status, created_at").eq("id", id).maybeSingle(),
    supabase.from("subscriptions").select("plan_id, status, current_period_start, current_period_end").eq("user_id", id).maybeSingle(),
    supabase.from("plans").select("id, name").eq("is_active", true).order("monthly_price_krw"),
    supabase.from("notes").select("id", { count: "exact", head: true }).eq("user_id", id),
    supabase.from("review_logs").select("id", { count: "exact", head: true }).eq("user_id", id),
    supabase.from("guardian_links").select("id, child_user_id, guardian_user_id, relationship, status, can_view_learning, can_manage_account, can_manage_billing").or(`child_user_id.eq.${id},guardian_user_id.eq.${id}`),
  ]);
  if (!profile) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin#members" className="text-sm font-semibold text-indigo-600">← 회원 관리</Link>
          <h1 className="mt-3 text-2xl font-bold">{profile.display_name ?? "이름 미등록"}</h1>
          <p className="mt-1 text-sm text-slate-500">회원 ID: {profile.id}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{new Date(profile.created_at).toLocaleDateString("ko-KR")} 가입</span>
      </div>
      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {success && <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{success}</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="저장된 오답" value={notesCount ?? 0} />
        <Metric label="복습 기록" value={reviewCount ?? 0} />
        <Metric label="보호자 연결" value={guardianLinks?.length ?? 0} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <form action={updateManagedUser} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <input type="hidden" name="userId" value={profile.id} />
          <h2 className="text-lg font-bold">회원 기본정보</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="이름"><input name="displayName" required defaultValue={profile.display_name ?? ""} className={inputClass} /></Field>
            <Field label="이메일"><input name="email" type="email" required defaultValue={profile.email ?? ""} className={inputClass} /></Field>
            <Field label="생년월일"><input name="dateOfBirth" type="date" required defaultValue={profile.date_of_birth ?? ""} className={inputClass} /></Field>
            <Field label="거주 국가">
              <select name="countryCode" defaultValue={profile.country_code ?? "KR"} className={inputClass}>
                <option value="KR">대한민국</option><option value="US">미국</option><option value="JP">일본</option><option value="CN">중국</option><option value="ZZ">기타</option>
              </select>
            </Field>
            <Field label="계정 상태">
              <select name="accountStatus" defaultValue={profile.account_status} className={inputClass}>
                <option value="active">정상</option><option value="suspended">이용 정지</option>
              </select>
            </Field>
            <Field label="보호자 동의">
              <select name="guardianConsentStatus" defaultValue={profile.guardian_consent_status} className={inputClass} disabled={!profile.guardian_required}>
                <option value="not_required">동의 불필요</option><option value="pending">동의 대기</option><option value="granted">동의 완료</option><option value="withdrawn">동의 철회</option>
              </select>
              {!profile.guardian_required && <input type="hidden" name="guardianConsentStatus" value="not_required" />}
            </Field>
          </div>
          <div className="flex justify-end"><button className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500">회원정보 저장</button></div>
        </form>

        <div className="space-y-6">
          <form action={resetManagedUserPassword} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <input type="hidden" name="userId" value={profile.id} />
            <div>
              <h2 className="text-lg font-bold">임시 비밀번호 설정</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">기존 비밀번호는 확인할 수 없으며 새 임시 비밀번호로만 재설정할 수 있습니다.</p>
            </div>
            <Field label="새 임시 비밀번호">
              <input name="password" type="password" minLength={8} required autoComplete="new-password" className={inputClass} />
            </Field>
            <Field label="새 임시 비밀번호 확인">
              <input name="passwordConfirm" type="password" minLength={8} required autoComplete="new-password" className={inputClass} />
            </Field>
            <button className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-400">임시 비밀번호 재설정</button>
          </form>

          <form action={updateUserPlan} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <input type="hidden" name="userId" value={profile.id} />
            <h2 className="text-lg font-bold">요금제 관리</h2>
            <Field label="요금제">
              <select name="planId" defaultValue={subscription?.plan_id ?? "free"} className={inputClass}>
                {plans?.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
              </select>
            </Field>
            <Field label="구독 상태">
              <select name="status" defaultValue={subscription?.status ?? "active"} className={inputClass}>
                <option value="active">정상</option><option value="trialing">체험 중</option><option value="past_due">결제 실패</option><option value="paused">일시 정지</option><option value="canceled">해지</option>
              </select>
            </Field>
            <button className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">요금제 저장</button>
          </form>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">보호자 연결</h2>
            <div className="mt-3 space-y-2 text-sm">
              {guardianLinks?.map((link) => (
                <form key={link.id} action={updateGuardianLink} className="space-y-3 rounded-xl bg-slate-50 p-3">
                  <input type="hidden" name="userId" value={profile.id} />
                  <input type="hidden" name="linkId" value={link.id} />
                  <strong>{link.child_user_id === id ? "연결된 보호자" : "관리 중인 자녀"}</strong>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select name="relationship" defaultValue={link.relationship} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs">
                      <option value="parent">부모</option>
                      <option value="legal_guardian">법정대리인</option>
                      <option value="other">기타 보호자</option>
                    </select>
                    <select name="status" defaultValue={link.status} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs">
                      <option value="pending">연결 대기</option>
                      <option value="active">활성</option>
                      <option value="rejected">거절</option>
                      <option value="revoked">철회</option>
                    </select>
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-600">
                    <label className="flex items-center gap-2"><input name="canViewLearning" type="checkbox" defaultChecked={link.can_view_learning} /> 학습 현황 열람</label>
                    <label className="flex items-center gap-2"><input name="canManageAccount" type="checkbox" defaultChecked={link.can_manage_account} /> 계정 관리</label>
                    <label className="flex items-center gap-2"><input name="canManageBilling" type="checkbox" defaultChecked={link.can_manage_billing} /> 결제 관리</label>
                  </div>
                  <button className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-100">연결 권한 저장</button>
                </form>
              ))}
              {!guardianLinks?.length && <p className="text-slate-500">연결된 보호자 또는 자녀가 없습니다.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

const inputClass = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm"><span className="font-semibold text-slate-700">{label}</span>{children}</label>;
}
function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value.toLocaleString("ko-KR")}</p></div>;
}
