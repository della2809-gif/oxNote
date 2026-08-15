import Link from "next/link";
import { BrandSymbol, BrandWordmark } from "@/components/BrandMark";

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
    <main className="flex flex-1 flex-col bg-[#f5f7ff] text-[#0b153d]">
      <section className="relative flex min-h-[720px] flex-col items-center justify-center overflow-hidden px-6 py-20 text-center sm:min-h-[820px]">
        <div className="flex flex-col items-center">
          <BrandSymbol className="h-14 w-28 sm:h-16 sm:w-32" />
          <BrandWordmark className="mt-10 h-20 w-64 sm:h-24 sm:w-72" />
          <h1 className="mt-14 break-keep text-4xl font-black tracking-[-0.06em] sm:text-6xl">
            틀려도 괜찮아.
          </h1>
          <p className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-[#8795c2] sm:text-4xl">
            다시 알면 되니까.
          </p>
          <p className="mt-8 text-lg font-extrabold tracking-wide text-[#3169ef] sm:text-2xl">
            Mistakes make you better
          </p>

          <div className="mt-12 flex flex-wrap justify-center gap-3">
          <Link
            href="/signup"
            className="min-h-12 rounded-xl bg-[#0b153d] px-7 py-3 text-sm font-bold text-white shadow-lg shadow-slate-300/50 transition hover:-translate-y-0.5 hover:bg-[#172552]"
          >
            무료로 시작하기
          </Link>
          <Link
            href="/login"
            className="min-h-12 rounded-xl border border-[#cdd5ee] bg-white/70 px-7 py-3 text-sm font-bold transition hover:-translate-y-0.5 hover:bg-white"
          >
            로그인
          </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-[#e1e6f6] bg-white px-6 py-20">
        <div className="mx-auto w-full max-w-4xl">
          <p className="text-center text-sm font-bold text-[#3169ef]">XONOTE LEARNING SYSTEM</p>
          <h2 className="mt-3 text-center text-2xl font-black tracking-tight sm:text-3xl">틀린 문제를 다시 아는 과정으로</h2>
          <div className="mt-10 grid grid-cols-1 gap-4 text-left sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-[#e1e6f6] bg-[#f8f9ff] p-5"
            >
              <h3 className="text-sm font-bold">{f.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">{f.desc}</p>
            </div>
          ))}
          </div>
          <div className="mt-12 flex flex-wrap justify-center gap-4 text-xs text-slate-500">
          <Link href="/settings?panel=support" className="underline">이용문의</Link>
          <Link href="/terms" className="underline">이용약관</Link>
          <Link href="/privacy" className="underline">개인정보 처리방침</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
