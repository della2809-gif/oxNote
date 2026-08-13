import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-16 text-center">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="xonote" className="mx-auto h-20 w-20 rounded-2xl" />
        <h1 className="mt-6 text-2xl font-bold text-slate-950">인터넷 연결을 확인해 주세요</h1>
        <p className="mt-3 leading-7 text-slate-600">로그인, AI 문제 분석과 저장은 안전한 데이터 처리를 위해 인터넷 연결이 필요합니다.</p>
        <Link href="/" className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-indigo-600 px-5 font-semibold text-white">다시 연결하기</Link>
      </div>
    </main>
  );
}
