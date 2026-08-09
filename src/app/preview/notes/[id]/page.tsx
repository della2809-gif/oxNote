import Link from "next/link";
import { notFound } from "next/navigation";

const PREVIEW_NOTES = {
  "math-linear-equation": {
    subject: "수학",
    color: "#6366f1",
    source: "라이트쎈 3-1",
    type: "조건식 활용",
    title: "일차방정식의 자연수 해 개수 구하기",
    question:
      "x, y에 대한 일차방정식 −ax + 2by = 0의 해가 (2, −1)일 때, 2ax − 3by = 20a를 만족시키는 자연수 x, y의 순서쌍의 개수를 구하여라.",
    studentAnswer: "2개",
    correctAnswer: "3개",
    mistakeReason: "y가 6일 때 x가 1이 되는 경우를 빠뜨렸어요.",
    concepts: ["일차방정식", "계수의 관계", "자연수 해"],
    steps: [
      {
        title: "계수의 관계 구하기",
        body: "(2, −1)을 −ax + 2by = 0에 대입하면 −2a − 2b = 0이므로 b = −a입니다.",
        formula: "−2a − 2b = 0  →  a + b = 0  →  b = −a",
      },
      {
        title: "두 번째 식 정리하기",
        body: "b = −a를 대입하고 a로 나누면 자연수 해를 찾을 식 2x + 3y = 20을 얻습니다.",
        formula: "2ax + 3ay = 20a  →  2x + 3y = 20",
      },
      {
        title: "자연수 순서쌍 확인하기",
        body: "y를 자연수로 대입해 x도 자연수가 되는 경우를 빠짐없이 확인합니다.",
        formula: "(x, y) = (7, 2), (4, 4), (1, 6)",
      },
    ],
  },
  "english-main-idea": {
    subject: "영어",
    color: "#06b6d4",
    source: "2025년 6월 모의고사",
    type: "글의 주제",
    title: "빈칸에 들어갈 가장 적절한 문장 찾기",
    question:
      "다음 글의 흐름으로 보아 빈칸에 들어갈 가장 적절한 문장을 고르시오. 반복되는 핵심어와 전환 표현에 유의하세요.",
    studentAnswer: "②",
    correctAnswer: "④",
    mistakeReason: "however 뒤에서 글의 방향이 바뀌는 것을 놓쳤어요.",
    concepts: ["전환 표현", "핵심어 반복", "문단의 주제"],
    steps: [
      { title: "전환 표현 찾기", body: "however가 앞 문장과 반대되는 내용을 이끈다는 점을 확인합니다.", formula: "앞 내용 ↔ however 뒤의 핵심 주장" },
      { title: "반복되는 핵심어 연결하기", body: "글 전체에서 반복되는 단어와 선택지의 표현을 비교합니다.", formula: "반복어 + 동의 표현 = 중심 내용" },
      { title: "문맥에 맞는 선택지 고르기", body: "앞뒤 문장을 자연스럽게 이어 주는 ④를 정답으로 선택합니다.", formula: "정답 ④" },
    ],
  },
  "korean-poetry": {
    subject: "국어",
    color: "#ef4444",
    source: "학교 중간고사",
    type: "문학 작품 이해",
    title: "화자의 태도와 정서 파악하기",
    question: "다음 시에 나타난 화자의 상황과 태도를 가장 적절하게 설명한 것을 고르시오.",
    studentAnswer: "①",
    correctAnswer: "③",
    mistakeReason: "시어 하나의 뜻만 보고 전체 상황과 연결하지 못했어요.",
    concepts: ["화자", "정서", "시적 상황"],
    steps: [
      { title: "화자의 상황 확인하기", body: "시에서 반복되는 대상과 시간·공간 표현을 먼저 찾습니다.", formula: "상황 → 정서 → 태도" },
      { title: "정서 변화 살펴보기", body: "처음과 마지막 연의 표현을 비교해 정서의 변화를 확인합니다.", formula: "그리움 → 수용" },
      { title: "선택지 판단하기", body: "시적 상황과 정서를 모두 설명하는 ③을 고릅니다.", formula: "정답 ③" },
    ],
  },
} as const;

export default async function PreviewNoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const note = PREVIEW_NOTES[id as keyof typeof PREVIEW_NOTES];
  if (!note) notFound();

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <strong className="text-xl tracking-tight">xonote</strong>
          <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">로그인 없는 화면 미리보기</span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-7 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/preview/notes" className="text-sm font-bold text-indigo-600">← 오답노트</Link>
          <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
            <span className="grid min-h-11 place-items-center rounded-xl bg-indigo-50 px-2 py-2.5 text-center text-xs font-bold text-indigo-600 sm:px-4 sm:text-sm">+ 새 문제 분석</span>
            <span className="grid min-h-11 place-items-center rounded-xl bg-indigo-600 px-2 py-2.5 text-center text-xs font-bold text-white sm:px-4 sm:text-sm">저장</span>
            <span className="grid min-h-11 place-items-center rounded-xl border border-rose-200 px-2 py-2.5 text-center text-xs font-bold text-rose-500 sm:px-4 sm:text-sm">삭제</span>
          </div>
        </div>

        <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-bold text-slate-400">문제 원본 미리보기</p>
            <div className="mt-4 grid min-h-72 place-items-center rounded-2xl bg-slate-100 p-8 text-center">
              <div>
                <span className="rounded-full px-3 py-1.5 text-xs font-bold" style={{ color: note.color, backgroundColor: `${note.color}14` }}>● {note.subject}</span>
                <p className="mt-5 text-base font-semibold leading-8 text-slate-700">{note.question}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-600">문제 인식 완료</span>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">{note.title}</h1>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-500">{note.source}</span>
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-600">{note.type}</span>
            </div>
            <div className="mt-6 rounded-2xl bg-slate-50 p-5">
              <p className="text-xs font-bold text-slate-400">인식한 문제의 핵심</p>
              <p className="mt-3 text-sm font-semibold leading-7">{note.question}</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {note.concepts.map((concept) => <span key={concept} className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-600">#{concept}</span>)}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-bold text-indigo-600">풀이 비교</p>
          <h2 className="mt-2 text-2xl font-bold">학생 풀이와 정답 풀이를 함께 확인해요</h2>
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-5">
              <p className="text-sm font-bold text-slate-500">내가 쓴 답</p>
              <p className="mt-3 text-xl font-bold">{note.studentAnswer}</p>
              <label className="mt-6 block text-sm font-bold text-slate-600">
                내가 틀린 이유
                <span className="mt-2 block rounded-xl border border-slate-200 bg-white p-4 font-normal leading-6 text-slate-600">{note.mistakeReason}</span>
              </label>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-emerald-700">정답 풀이 과정</p>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-700">정답 {note.correctAnswer}</span>
              </div>
              <div className="mt-5 space-y-5">
                {note.steps.map((step, index) => (
                  <div key={step.title} className="flex gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500 text-sm font-bold text-white">{index + 1}</span>
                    <div>
                      <p className="text-sm font-bold text-slate-800">{step.title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{step.body}</p>
                      <p className="mt-2 overflow-x-auto rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-700">{step.formula}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-bold text-indigo-600">GPT 학습 분석</p>
          <h2 className="mt-2 text-2xl font-bold">이 문제에 필요한 핵심 개념</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {note.concepts.map((concept, index) => (
              <div key={concept} className="rounded-2xl bg-indigo-50/70 p-5">
                <p className="font-bold">{concept}</p>
                <p className="mt-3 text-sm leading-6 text-slate-600">{note.steps[Math.min(index, note.steps.length - 1)].body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
