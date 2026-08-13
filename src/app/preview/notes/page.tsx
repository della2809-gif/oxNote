import Link from "next/link";

const SUBJECTS = [
  { id: "math", name: "수학", color: "#6366f1" },
  { id: "english", name: "영어", color: "#06b6d4" },
  { id: "korean", name: "국어", color: "#ef4444" },
];

const CLASSIFICATIONS = [
  { label: "개념·단원", description: "AI 태그로 묶어보기" },
  { label: "시험·교재", description: "출제 출처로 묶어보기" },
  { label: "문제 유형", description: "풀이 유형으로 묶어보기" },
  { label: "핵심 개념", description: "풀이에 쓰인 개념으로 묶어보기" },
  { label: "오답 이유", description: "틀린 원인으로 묶어보기" },
];

const SAMPLE_NOTES = [
  {
    id: "math-linear-equation",
    subject: "math",
    source: "라이트쎈 3-1",
    type: "조건식 활용",
    title: "일차방정식의 자연수 해 개수 구하기",
    summary: "계수의 관계를 먼저 구한 뒤 자연수 조건을 확인하는 문제",
    date: "2026. 8. 9.",
  },
  {
    id: "english-main-idea",
    subject: "english",
    source: "2025년 6월 모의고사",
    type: "글의 주제",
    title: "빈칸에 들어갈 가장 적절한 문장 찾기",
    summary: "문단의 전환 표현과 반복되는 핵심어를 확인하는 문제",
    date: "2026. 8. 8.",
  },
  {
    id: "korean-poetry",
    subject: "korean",
    source: "학교 중간고사",
    type: "문학 작품 이해",
    title: "화자의 태도와 정서 파악하기",
    summary: "시어의 의미와 상황을 연결해 화자의 태도를 찾는 문제",
    date: "2026. 8. 7.",
  },
];

export default async function NotesPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const { subject = "" } = await searchParams;
  const activeSubject = SUBJECTS.find((item) => item.id === subject);
  const notes = activeSubject
    ? SAMPLE_NOTES.filter((note) => note.subject === activeSubject.id)
    : SAMPLE_NOTES;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <strong className="text-xl tracking-tight">xonote</strong>
          <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
            로그인 없는 화면 미리보기
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-8">
        <section className="flex flex-wrap items-end justify-between gap-5 rounded-2xl bg-white p-5 sm:p-7">
          <div>
            <p className="text-sm font-bold text-indigo-600">나의 학습 라이브러리</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">오답노트</h1>
            <p className="mt-2 text-sm text-slate-500">
              첫 화면은 과목 중심으로 간단히 보고, 과목을 선택하면 세부 분류를 확인합니다.
            </p>
          </div>
          <span className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-100">
            + 새 문제 분석
          </span>
        </section>

        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">과목별 보기</p>
              <span className="text-xs font-bold text-indigo-600">과목 관리 →</span>
            </div>
            <div className="-mx-2 mt-3 flex flex-nowrap items-center gap-2 overflow-x-auto px-2 pb-2 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
              <Link
                href="/preview/notes"
                className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-bold ${
                  !activeSubject
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                전체
              </Link>
              {SUBJECTS.map((item) => (
                <Link
                  key={item.id}
                  href={`/preview/notes?subject=${item.id}`}
                  className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-bold ${
                    activeSubject?.id === item.id
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: activeSubject?.id === item.id ? "white" : item.color }}
                  />
                  {item.name}
                </Link>
              ))}
              <span className="hidden h-7 w-px bg-slate-200 sm:block" />
              <span className="shrink-0 whitespace-nowrap rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">
                최신순⌄
              </span>
              <span className="shrink-0 whitespace-nowrap rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">
                필터⌄
              </span>
            </div>
          </div>

          {activeSubject && (
            <div className="border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">분류 기준</p>
                <p className="text-xs font-medium text-slate-400">{activeSubject.name} 과목 세부 보기</p>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-5">
                {CLASSIFICATIONS.map((item) => (
                  <div key={item.label} className="rounded-xl border border-slate-200 p-3">
                    <span className="block text-sm font-bold text-slate-700">{item.label}</span>
                    <span className="mt-1 block text-xs text-slate-400">{item.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-xl font-bold">{activeSubject?.name ?? "전체 과목"}</h2>
              <p className="mt-1 text-xs text-slate-400">{notes.length}개의 샘플 오답</p>
            </div>
            <span className="text-xs text-slate-400">화면 확인용 데이터입니다</span>
          </div>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {notes.map((note) => {
              const noteSubject = SUBJECTS.find((item) => item.id === note.subject)!;
              return (
                <li key={note.id}>
                  <Link href={`/preview/notes/${note.id}`} className="group block p-5 transition hover:bg-slate-50">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className="rounded-full px-2.5 py-1 font-bold"
                      style={{ color: noteSubject.color, backgroundColor: `${noteSubject.color}14` }}
                    >
                      ● {noteSubject.name}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-500">{note.source}</span>
                    <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-600">{note.type}</span>
                  </div>
                  <div className="mt-3 flex items-start justify-between gap-4">
                    <div>
                      <p className="font-bold text-slate-800">{note.title}</p>
                      <p className="mt-1 text-xs text-slate-400">{note.summary}</p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400 transition group-hover:text-indigo-600">{note.date}　→</span>
                  </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}
