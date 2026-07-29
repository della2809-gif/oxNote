import Link from "next/link";
import { signUp } from "../actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <form action={signUp} className="space-y-4 rounded-xl border border-neutral-200 p-6 dark:border-neutral-800">
      <h1 className="text-lg font-semibold">회원가입</h1>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="space-y-1">
        <label htmlFor="displayName" className="text-sm font-medium">이름</label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <fieldset>
            <legend className="text-sm font-medium">생년월일</legend>
            <div className="mt-1 grid grid-cols-[1.25fr_1fr_1fr] gap-2">
              <label className="sr-only" htmlFor="birthYear">출생 연도</label>
              <input
                id="birthYear"
                name="birthYear"
                type="text"
                inputMode="numeric"
                autoComplete="bday-year"
                required
                maxLength={4}
                pattern="\d{4}"
                placeholder="YYYY"
                aria-label="출생 연도"
                className="min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-center text-sm dark:border-neutral-700 dark:bg-neutral-900"
              />
              <label className="sr-only" htmlFor="birthMonth">출생 월</label>
              <input
                id="birthMonth"
                name="birthMonth"
                type="text"
                inputMode="numeric"
                autoComplete="bday-month"
                required
                maxLength={2}
                pattern="\d{1,2}"
                placeholder="MM"
                aria-label="출생 월"
                className="min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-center text-sm dark:border-neutral-700 dark:bg-neutral-900"
              />
              <label className="sr-only" htmlFor="birthDay">출생 일</label>
              <input
                id="birthDay"
                name="birthDay"
                type="text"
                inputMode="numeric"
                autoComplete="bday-day"
                required
                maxLength={2}
                pattern="\d{1,2}"
                placeholder="DD"
                aria-label="출생 일"
                className="min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-center text-sm dark:border-neutral-700 dark:bg-neutral-900"
              />
            </div>
            <p className="mt-1 text-xs text-neutral-500">예: 2010년 3월 8일 → 2010 / 03 / 08</p>
          </fieldset>
        </div>
        <div className="space-y-1">
          <label htmlFor="countryCode" className="text-sm font-medium">거주 국가</label>
          <select
            id="countryCode"
            name="countryCode"
            defaultValue="KR"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="KR">대한민국</option>
            <option value="US">미국</option>
            <option value="JP">일본</option>
            <option value="CN">중국</option>
            <option value="ZZ">기타</option>
          </select>
          <p className="text-xs text-neutral-500">
            미성년 학습자는 가입 후 보호자 계정을 연결해야 결제와 계정 관리를 이용할 수 있습니다.
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium">이메일</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium">비밀번호</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>

      <div className="space-y-3 rounded-lg bg-neutral-50 p-3 text-sm dark:bg-neutral-900">
        <label className="flex items-start gap-2">
          <input name="agreeTerms" type="checkbox" required className="mt-1" />
          <span>
            <Link href="/terms" target="_blank" className="underline">이용약관</Link>에 동의합니다. (필수)
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input name="agreePrivacy" type="checkbox" required className="mt-1" />
          <span>
            <Link href="/privacy" target="_blank" className="underline">개인정보 처리방침</Link>에 동의합니다. (필수)
          </span>
        </label>
      </div>

      <button
        type="submit"
        className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
      >
        가입하기
      </button>

      <p className="text-center text-sm text-neutral-500">
        이미 계정이 있으신가요?{" "}
        <Link href="/login" className="font-medium text-neutral-900 underline dark:text-white">
          로그인
        </Link>
      </p>
    </form>
  );
}
