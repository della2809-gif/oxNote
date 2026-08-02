import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createBenchmarkSource, createReferenceCohort, rebuildInternalCohorts, updatePerformanceRollout } from "./actions";

type SearchParams = { error?: string; success?: string };
const fieldClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400";

export const dynamic = "force-dynamic";

export default async function AdminPerformancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.app_metadata?.role !== "admin") redirect("/dashboard");

  const [flagResult, resultsResult, cohortsResult, sourcesResult, reportsResult, importsResult, consentsResult] = await Promise.all([
    supabase.from("product_feature_flags").select("member_enabled, admin_preview_enabled, updated_at").eq("key", "performance_benchmarking").maybeSingle(),
    supabase.from("exam_results").select("id, user_id, subject_name, grade_level, region_code, exam_name, exam_date, score_percent, wrong_rate, source_type, verification_status, created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("benchmark_cohorts").select("id, source_id, subject_name, grade_level, region_scope, region_code, score_band_low, score_band_high, sample_size, average_score, average_wrong_rate, confidence_level, refreshed_at").order("refreshed_at", { ascending: false }).limit(100),
    supabase.from("benchmark_sources").select("id, code, name, provider_type, source_url, is_active, imported_at").order("created_at"),
    supabase.from("performance_reports").select("id, user_id, exam_result_id, national_percentile, regional_percentile, predicted_score_low, predicted_score_high, prediction_confidence, generated_at").order("generated_at", { ascending: false }).limit(100),
    supabase.from("score_report_imports").select("id, user_id, file_name, status, failure_reason, created_at, completed_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("performance_consents").select("user_id, benchmark_enabled, regional_comparison_enabled, score_report_ocr_enabled"),
  ]);
  const results = resultsResult.data ?? [];
  const cohorts = cohortsResult.data ?? [];
  const sources = sourcesResult.data ?? [];
  const reports = reportsResult.data ?? [];
  const imports = importsResult.data ?? [];
  const consents = consentsResult.data ?? [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const errors = [flagResult.error, resultsResult.error, cohortsResult.error, sourcesResult.error, reportsResult.error, importsResult.error, consentsResult.error].filter(Boolean);

  return (
    <div className="space-y-6 text-slate-950">
      <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <Link href="/admin" className="text-sm font-semibold text-indigo-300 hover:text-white">← 운영자 콘솔</Link>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">Learning Intelligence</p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">성적·오답 비교 운영</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">개인 성적 입력부터 성적표 AI 인식, 익명 지역·전국 비교군, 공공 데이터 보정과 점수 예측까지 한 화면에서 확인합니다.</p>
          </div>
          <Link href="/performance" className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950">회원 화면 미리보기</Link>
        </div>
      </section>

      {(params.error || params.success || errors.length > 0) && <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${params.error || errors.length ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{params.error ?? params.success ?? "일부 성적 분석 테이블을 읽지 못했습니다. 마이그레이션 적용 여부를 확인해 주세요."}</div>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="등록 성적" value={results.length} detail="최근 100건 기준" />
        <Metric label="익명 비교군" value={cohorts.length} detail={`${cohorts.filter((item) => item.sample_size >= 30).length}개 공개 가능`} />
        <Metric label="예측 보고서" value={reports.length} detail="점수 범위·위치" />
        <Metric label="OCR 처리" value={imports.length} detail={`${imports.filter((item) => item.status === "failed").length}건 실패`} />
        <Metric label="비교 참여 동의" value={consents.filter((item) => item.benchmark_enabled).length} detail={`${consents.filter((item) => item.regional_comparison_enabled).length}명 지역 비교`} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <form action={updatePerformanceRollout} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Rollout</p>
          <h2 className="mt-2 text-xl font-bold">회원 공개 상태</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">현재 요청대로 회원 홈에는 유료 전용 비활성 버튼만 노출합니다. 아래 스위치를 켜기 전까지 직접 URL 접근도 차단됩니다.</p>
          <label className="mt-5 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-4">
            <span><strong className="block text-sm">유료회원 기능 공개</strong><small className="text-slate-400">Pro·활성 구독만 접근</small></span>
            <input type="checkbox" name="memberEnabled" defaultChecked={flagResult.data?.member_enabled} className="h-5 w-5" />
          </label>
          <button className="mt-4 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white">공개 상태 저장</button>
        </form>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Anonymous cohorts</p><h2 className="mt-2 text-xl font-bold">xonote 익명 비교군 갱신</h2><p className="mt-2 text-sm text-slate-500">동의한 회원만 사용하며 이름·이메일·학교명 없이 학년·과목·시험·5점 구간·시도 단위로 집계합니다.</p></div>
            <form action={rebuildInternalCohorts}><button className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700">비교군·예측 다시 계산</button></form>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3"><Status label="회원 노출 기준" value="30명 이상" /><Status label="점수 구간" value="5점 단위" /><Status label="집계 기간" value="최근 12개월" /></div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <form action={createBenchmarkSource} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">External calibration</p><h2 className="mt-2 text-xl font-bold">공공·제휴 데이터 소스</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2"><Input name="code" label="소스 코드" placeholder="schoolinfo_2026" required /><Input name="name" label="표시 이름" placeholder="학교알리미 2026" required /><label className="space-y-2 text-xs font-bold text-slate-600"><span>유형</span><select name="providerType" className={fieldClass}><option value="public">공공</option><option value="partner">제휴</option></select></label><Input name="sourceUrl" label="출처 URL" placeholder="https://..." /><Input name="licenseNote" label="이용·라이선스 메모" placeholder="공개 범위와 이용 조건" wide /></div>
          <button className="mt-4 rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white">데이터 소스 저장</button>
          <div className="mt-5 space-y-2">{sources.map((source) => <div key={source.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3 text-sm"><span><strong>{source.name}</strong><small className="ml-2 text-slate-400">{source.provider_type}</small></span><span className="text-xs text-slate-400">{source.code}</span></div>)}</div>
        </form>

        <form action={createReferenceCohort} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Reference aggregate</p><h2 className="mt-2 text-xl font-bold">외부 기준 집계 입력</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <label className="space-y-2 text-xs font-bold text-slate-600 sm:col-span-2"><span>데이터 소스</span><select name="sourceId" required className={fieldClass}>{sources.filter((source) => source.provider_type !== "internal").map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
            <label className="space-y-2 text-xs font-bold text-slate-600"><span>학교급</span><select name="schoolLevel" className={fieldClass}><option value="middle">중학교</option><option value="high">고등학교</option><option value="elementary">초등학교</option><option value="university">대학교</option><option value="adult">성인·자격시험</option></select></label>
            <Input name="gradeLevel" label="학년" required /><Input name="subjectName" label="과목" required /><Input name="examType" label="시험 종류" required />
            <label className="space-y-2 text-xs font-bold text-slate-600"><span>범위</span><select name="regionScope" className={fieldClass}><option value="national">전국</option><option value="region">시·도</option></select></label><Input name="regionCode" label="지역 코드" placeholder="SEOUL" />
            <Input name="sampleSize" label="표본 수" type="number" required /><Input name="scoreBandLow" label="점수 구간 시작" type="number" required /><Input name="scoreBandHigh" label="점수 구간 끝" type="number" required />
            <Input name="averageScore" label="평균 점수" type="number" /><Input name="averageWrongRate" label="평균 오답률" type="number" /><Input name="periodStart" label="자료 시작일" type="date" required /><Input name="periodEnd" label="자료 종료일" type="date" required />
          </div>
          <button className="mt-4 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300" disabled={!sources.some((source) => source.provider_type !== "internal")}>외부 기준 데이터 반영</button>
        </form>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">비교군 전체 현황</h2><p className="mt-1 text-sm text-slate-500">운영자에게는 표본 수와 관계없이 내부·공공·제휴 비교군이 모두 표시됩니다.</p>
        <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-slate-200 text-xs text-slate-400"><tr><th className="py-3">출처</th><th>학년·과목</th><th>지역</th><th>점수 구간</th><th>표본</th><th>평균점수</th><th>오답률</th><th>신뢰도</th></tr></thead><tbody className="divide-y divide-slate-100">{cohorts.map((cohort) => <tr key={cohort.id}><td className="py-3 font-medium">{sourceById.get(cohort.source_id)?.name ?? "-"}</td><td>{cohort.grade_level} · {cohort.subject_name}</td><td>{cohort.region_scope === "national" ? "전국" : cohort.region_code}</td><td>{cohort.score_band_low}~{cohort.score_band_high}</td><td>{cohort.sample_size}명</td><td>{cohort.average_score ?? "-"}</td><td>{cohort.average_wrong_rate == null ? "-" : `${cohort.average_wrong_rate}%`}</td><td><Confidence value={cohort.confidence_level} /></td></tr>)}</tbody></table>{!cohorts.length && <p className="py-10 text-center text-sm text-slate-400">아직 생성된 비교군이 없습니다.</p>}</div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">최근 회원 성적·예측</h2><div className="mt-5 space-y-3">{results.slice(0, 20).map((result) => { const report = reports.find((item) => item.exam_result_id === result.id); return <div key={result.id} className="grid gap-3 rounded-2xl border border-slate-100 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><p className="font-bold">{result.exam_name}</p><p className="mt-1 text-xs text-slate-400">{result.user_id.slice(0, 8)} · {result.grade_level} · {result.subject_name} · {result.region_code}</p></div><div className="text-sm"><span className="text-slate-400">점수 </span><strong>{result.score_percent}</strong></div><div className="text-sm"><span className="text-slate-400">예측 </span><strong>{report ? `${report.predicted_score_low}~${report.predicted_score_high}` : "대기"}</strong></div></div>; })}{!results.length && <p className="py-10 text-center text-sm text-slate-400">등록된 성적이 없습니다.</p>}</div></div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">성적표 AI 처리 로그</h2><div className="mt-5 space-y-3">{imports.map((item) => <div key={item.id} className="rounded-2xl bg-slate-50 p-4"><div className="flex justify-between gap-3"><p className="truncate text-sm font-bold">{item.file_name}</p><Confidence value={item.status} /></div><p className="mt-2 text-xs text-slate-400">{new Date(item.created_at).toLocaleString("ko-KR")}</p>{item.failure_reason && <p className="mt-2 text-xs text-rose-600">{item.failure_reason}</p>}</div>)}{!imports.length && <p className="py-10 text-center text-sm text-slate-400">AI 처리 기록이 없습니다.</p>}</div></div>
      </section>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold">{value.toLocaleString("ko-KR")}</p><p className="mt-2 text-xs text-slate-400">{detail}</p></div>; }
function Status({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 px-3 py-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-sm font-bold">{value}</p></div>; }
function Input({ name, label, placeholder, type = "text", required = false, wide = false }: { name: string; label: string; placeholder?: string; type?: string; required?: boolean; wide?: boolean }) { return <label className={`space-y-2 text-xs font-bold text-slate-600 ${wide ? "sm:col-span-2" : ""}`}><span>{label}</span><input name={name} type={type} required={required} placeholder={placeholder} step={type === "number" ? "0.01" : undefined} className={fieldClass} /></label>; }
function Confidence({ value }: { value: string }) { const cls = value === "high" || value === "completed" ? "bg-emerald-50 text-emerald-700" : value === "medium" || value === "processing" ? "bg-blue-50 text-blue-700" : value === "failed" || value === "insufficient" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"; return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${cls}`}>{value}</span>; }
