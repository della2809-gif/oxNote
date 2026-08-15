import Link from "next/link";

const FEATURES = [
  {
    title: "AI 오답 분석",
    desc: "문제, 내가 쓴 답, 정답을 입력하거나 파일을 올리면 GPT가 오답 원인과 학습 포인트를 분석합니다.",
  },
  {
    title: "과목별 정리",
    desc: "모든 과목의 오답을 한곳에서 관리하고 과목별로 모아볼 수 있습니다.",
  },
  {
    title: "간격 반복 복습",
    desc: "Leitner 박스 방식으로 틀린 문제를 최적의 타이밍에 다시 복습합니다.",
  },
  {
    title: "성장 대시보드",
    desc: "과목별 정답률과 복습 현황을 한눈에 확인할 수 있습니다.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-neutral-50 px-6 py-24 dark:bg-neutral-950">
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight">xonote</h1>
        <p className="mt-3 text-lg text-neutral-600 dark:text-neutral-400">
          모든 과목의 오답을 모아 AI가 분석해주는 시험 성장 플랫폼
        </p>

        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
          >
            무료로 시작하기
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-neutral-300 px-5 py-2.5 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            로그인
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-4 text-left sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <h2 className="text-sm font-semibold">{feature.title}</h2>
              <p className="mt-1 text-sm text-neutral-500">{feature.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex justify-center gap-4 text-xs text-neutral-500">
          <Link href="/settings?panel=support" className="underline">이용문의</Link>
          <Link href="/terms" className="underline">이용약관</Link>
          <Link href="/privacy" className="underline">개인정보 처리방침</Link>
        </div>
      </div>
    </div>
  );
}
