import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createManagedUser } from "../../actions";

export default async function NewManagedUserPage({
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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/admin#members" className="text-sm font-semibold text-indigo-600">← 회원 관리</Link>
        <h1 className="mt-3 text-2xl font-bold">회원 추가</h1>
        <p className="mt-1 text-sm text-slate-500">운영자가 이메일 인증이 완료된 회원 계정을 생성합니다.</p>
      </div>
      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      <form action={createManagedUser} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="이름">
            <input name="displayName" required className={inputClass} />
          </Field>
          <Field label="이메일">
            <input name="email" type="email" required autoComplete="off" className={inputClass} />
          </Field>
          <Field label="생년월일">
            <input name="dateOfBirth" type="date" required max={new Date().toISOString().slice(0, 10)} className={inputClass} />
          </Field>
          <Field label="거주 국가">
            <select name="countryCode" defaultValue="KR" className={inputClass}>
              <option value="KR">대한민국</option>
              <option value="US">미국</option>
              <option value="JP">일본</option>
              <option value="CN">중국</option>
              <option value="ZZ">기타</option>
            </select>
          </Field>
        </div>
        <Field label="임시 비밀번호">
          <input name="password" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
          <p className="mt-1 text-xs text-slate-500">8자 이상 입력하고 사용자에게 안전한 방법으로 전달해 주세요.</p>
        </Field>
        <div className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
          운영자가 생성한 계정은 이메일이 확인된 상태로 만들어집니다. 본인 요청이나 보호자 확인이 끝난 회원만 추가하세요.
        </div>
        <div className="flex justify-end gap-3">
          <Link href="/admin#members" className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold">취소</Link>
          <button className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500">회원 생성</button>
        </div>
      </form>
    </div>
  );
}

const inputClass = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm"><span className="font-semibold text-slate-700">{label}</span>{children}</label>;
}

