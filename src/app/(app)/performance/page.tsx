import { redirect } from "next/navigation";
import { getPerformanceAccess, MIN_PUBLIC_COHORT_SIZE } from "@/lib/performance";
import { createClient } from "@/lib/supabase/server";
import { createExamResult, createExamResultFromScoreReport, savePerformanceConsent } from "./actions";

type SearchParams = { error?: string; success?: string };

const fieldClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50";

export const dynamic = "force-dynamic";

export default async function PerformancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const access = await getPerformanceAccess(user);
  if (!access.allowed) redirect("/dashboard?notice=performance-coming-soon");

  const [{ data: results }, { data: reports }, { data: subjects }, { data: notes }, { data: consent }] = await Promise.all([
    supabase.from("exam_results").select("*").eq("user_id", user.id).order("exam_date", { ascending: false }).limit(20),
    supabase.from("performance_reports").select("*").eq("user_id", user.id).order("generated_at", { ascending: false }).limit(20),
    supabase.from("subjects").select("id, name").eq("user_id", user.id).order("name"),
    supabase.from("notes").select("id, question, mistake_type, subject_id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
    supabase.from("performance_consents").select("benchmark_enabled, regional_comparison_enabled, score_report_ocr_enabled").eq("user_id", user.id).maybeSingle(),
  ]);
  const reportByExam = new Map((reports ?? []).map((report) => [report.exam_result_id, report]));

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-indigo-700 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-sm font-bold text-indigo-200">유료 기능 · 운영자 미리보기</p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">성적·오답 비교 분석</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-indigo-100">
              성적을 입력하거나 성적표를 올려 유사 성적군의 오답률, 지역·전국 위치와 예상 점수 범위를 확인합니다.
            </p>
          </div>
          <span className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold">
            {access.isAdmin ? "관리자 전체 기능" : "Pro"}
          </span>
        </div>
      </section>

      {(params.error || params.success) && (
        <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${params.error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {params.error ?? params.success}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[1fr_0.72fr]">
        <form action={createExamResult} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">1차 · 직접 입력</p>
            <h2 className="mt-2 text-xl font-bold">시험 성적 등록</h2>
            <p className="mt-1 text-sm text-slate-500">원점수뿐 아니라 시험 평균·석차를 입력하면 비교 정확도가 높아집니다.</p>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="학교급"><select name="schoolLevel" required className={fieldClass}><option value="middle">중학교</option><option value="high">고등학교</option><option value="elementary">초등학교</option><option value="university">대학교</option><option value="adult">성인·자격시험</option></select></Field>
            <Field label="학년·대상"><input name="gradeLevel" required className={fieldClass} placeholder="예: 중2, 고3, 공무원 9급" /></Field>
            <Field label="지역"><select name="regionCode" className={fieldClass}><option value="KR">전국·미선택</option><option value="SEOUL">서울</option><option value="GYEONGGI">경기</option><option value="INCHEON">인천</option><option value="BUSAN">부산</option><option value="DAEGU">대구</option><option value="DAEJEON">대전</option><option value="GWANGJU">광주</option><option value="ULSAN">울산</option><option value="SEJONG">세종</option><option value="GANGWON">강원</option><option value="CHUNGBUK">충북</option><option value="CHUNGNAM">충남</option><option value="JEONBUK">전북</option><option value="JEONNAM">전남</option><option value="GYEONGBUK">경북</option><option value="GYEONGNAM">경남</option><option value="JEJU">제주</option></select></Field>
            <Field label="과목"><input name="subjectName" required list="subject-options" className={fieldClass} placeholder="예: 수학" /><datalist id="subject-options">{subjects?.map((subject) => <option key={subject.id} value={subject.name} />)}</datalist></Field>
            <Field label="시험 종류"><input name="examType" required className={fieldClass} placeholder="예: 학교 중간고사" /></Field>
            <Field label="시험명"><input name="examName" required className={fieldClass} placeholder="예: 1학기 중간고사" /></Field>
            <Field label="시험일"><input name="examDate" required type="date" className={fieldClass} /></Field>
            <Field label="받은 점수"><input name="rawScore" required type="number" min="0" step="0.01" className={fieldClass} placeholder="78" /></Field>
            <Field label="만점"><input name="maxScore" required type="number" min="1" step="0.01" defaultValue="100" className={fieldClass} /></Field>
            <Field label="전체 문항 수 (선택)"><input name="questionCount" type="number" min="1" className={fieldClass} /></Field>
            <Field label="틀린 문항 수 (선택)"><input name="wrongAnswerCount" type="number" min="0" className={fieldClass} /></Field>
            <Field label="시험 평균 (선택)"><input name="examAverageScore" type="number" min="0" step="0.01" className={fieldClass} /></Field>
            <Field label="백분위 (선택)"><input name="percentileRank" type="number" min="0" max="100" step="0.01" className={fieldClass} /></Field>
            <Field label="석차 (선택)"><input name="rankPosition" type="number" min="1" className={fieldClass} /></Field>
            <Field label="응시 인원 (선택)"><input name="examineeCount" type="number" min="1" className={fieldClass} /></Field>
          </div>
          {(notes?.length ?? 0) > 0 && (
            <details className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <summary className="cursor-pointer text-sm font-bold text-slate-700">이 시험의 오답노트 연결하기 (선택)</summary>
              <div className="mt-4 grid max-h-52 gap-2 overflow-y-auto">
                {notes?.map((note) => <label key={note.id} className="flex items-start gap-3 rounded-xl bg-white px-3 py-3 text-sm"><input type="checkbox" name="noteIds" value={note.id} className="mt-1" /><span><strong className="block line-clamp-1">{note.question}</strong><small className="text-slate-400">{note.mistake_type ?? "오답 이유 미분류"}</small></span></label>)}
              </div>
            </details>
          )}
          <button className="mt-6 w-full rounded-xl bg-indigo-600 px-5 py-3.5 text-sm font-bold text-white hover:bg-indigo-700">성적 저장 및 비교 분석</button>
        </form>

        <div className="space-y-6">
          <form action={createExamResultFromScoreReport} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">2차 · AI 인식</p>
            <h2 className="mt-2 text-xl font-bold">성적표 사진·PDF 인식</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">이름·학교명은 결과에 저장하지 않고 시험 정보와 점수만 구조화합니다.</p>
            <Field label="비교 지역"><select name="regionCode" className={`${fieldClass} mt-5`}><option value="KR">전국·미선택</option><option value="SEOUL">서울</option><option value="GYEONGGI">경기</option><option value="BUSAN">부산</option><option value="DAEGU">대구</option><option value="JEJU">제주</option></select></Field>
            <label className="mt-4 grid min-h-40 cursor-pointer place-items-center rounded-2xl border border-dashed border-indigo-300 bg-indigo-50 p-6 text-center">
              <span><strong className="block text-indigo-700">성적표 파일 선택</strong><small className="mt-2 block text-indigo-500">JPG·PNG·WEBP·PDF, 최대 15MB</small></span>
              <input type="file" name="scoreReport" accept="image/jpeg,image/png,image/webp,application/pdf" required className="sr-only" />
            </label>
            <button className="mt-4 w-full rounded-xl bg-violet-600 px-5 py-3.5 text-sm font-bold text-white hover:bg-violet-700">AI로 성적표 읽기</button>
          </form>

          <form action={savePerformanceConsent} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">개인정보 설정</p>
            <h2 className="mt-2 text-lg font-bold">익명 비교 데이터 활용</h2>
            <div className="mt-4 space-y-3 text-sm">
              <Check name="benchmarkEnabled" defaultChecked={consent?.benchmark_enabled} label="익명 유사 성적군 비교에 참여" />
              <Check name="regionalEnabled" defaultChecked={consent?.regional_comparison_enabled} label="시·도 단위 지역 비교 사용" />
              <Check name="ocrEnabled" defaultChecked={consent?.score_report_ocr_enabled} label="성적표 AI 인식 사용" />
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-400">이름·이메일·학교명은 비교 집계에서 제외하며, 비교 표본이 {MIN_PUBLIC_COHORT_SIZE}명 미만이면 회원에게 결과를 공개하지 않습니다.</p>
            <button className="mt-4 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">설정 저장</button>
          </form>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">3차 · 보정·예측</p>
          <h2 className="mt-2 text-xl font-bold">나의 성적 위치와 예상 점수</h2>
          <p className="mt-1 text-sm text-slate-500">내부 익명 집계와 등록된 공공·제휴 기준 데이터를 함께 사용합니다.</p>
        </div>
        <div className="mt-6 space-y-4">
          {(results ?? []).map((result) => {
            const report = reportByExam.get(result.id);
            const payload = (report?.comparison_payload ?? {}) as { sampleSize?: number; sampleNotice?: string; recommendations?: string[] };
            return <article key={result.id} className="rounded-2xl border border-slate-200 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-700">{result.subject_name}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{result.grade_level}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{result.source_type === "ocr" ? "AI 인식" : "직접 입력"}</span></div><h3 className="mt-3 font-bold">{result.exam_name}</h3><p className="mt-1 text-sm text-slate-500">{result.exam_date} · {result.score_percent}점 환산</p></div><strong className="text-2xl">{result.raw_score}/{result.max_score}</strong></div><div className="mt-5 grid gap-3 sm:grid-cols-4"><MiniMetric label="전국 위치" value={report?.national_percentile == null ? "표본 수집 중" : `상위 ${Math.max(1, Math.round(100 - Number(report.national_percentile)))}%`} /><MiniMetric label="지역 위치" value={report?.regional_percentile == null ? "표본 수집 중" : `상위 ${Math.max(1, Math.round(100 - Number(report.regional_percentile)))}%`} /><MiniMetric label="나의 오답률" value={result.wrong_rate == null ? "입력 필요" : `${result.wrong_rate}%`} /><MiniMetric label="예상 점수" value={report?.predicted_score_low == null ? "분석 대기" : `${report.predicted_score_low}~${report.predicted_score_high}`} /></div>{payload.sampleNotice && <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">{payload.sampleNotice}</p>}{payload.recommendations?.map((text) => <p key={text} className="mt-3 text-sm text-slate-600">→ {text}</p>)}</article>;
          })}
          {!results?.length && <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">성적을 등록하면 비교 결과가 이곳에 나타납니다.</div>}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-2 text-xs font-bold text-slate-600"><span>{label}</span>{children}</label>; }
function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) { return <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-3"><input type="checkbox" name={name} defaultChecked={defaultChecked} /><span>{label}</span></label>; }
function MiniMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 px-3 py-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-sm font-bold text-slate-800">{value}</p></div>; }
