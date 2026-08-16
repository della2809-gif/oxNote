import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { saveAiEvaluation } from "./actions";

type Row = { id:string; problem_number:number; analysis_mode:"a"|"b"; recognition_status:string; answer_status:string; solution_status:string; notation_status:string; severity:string; processing_ms:number|null; estimated_cost_usd:number|null };
const inputClass = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm";
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }:{ searchParams:Promise<{error?:string;success?:string}> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data:{ user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.app_metadata?.role !== "admin") redirect("/dashboard");
  const result = await supabase.from("ai_evaluation_results").select("id,problem_number,analysis_mode,recognition_status,answer_status,solution_status,notation_status,severity,processing_ms,estimated_cost_usd").eq("test_batch","math-46").order("problem_number").order("analysis_mode");
  const rows = (result.data as Row[] | null) ?? [];
  const summaries = (["a","b"] as const).map((mode) => {
    const modeRows = rows.filter((row) => row.analysis_mode === mode);
    const scored = modeRows.filter((row) => row.answer_status !== "unscorable");
    const avg = (values:number[]) => values.length ? values.reduce((a,b) => a+b,0)/values.length : 0;
    return { mode, count:modeRows.length,
      answer:scored.length ? scored.filter((row)=>row.answer_status==="passed").length/scored.length*100 : 0,
      complete:scored.length ? scored.filter((row)=>row.recognition_status==="passed"&&row.answer_status==="passed"&&row.solution_status==="passed"&&row.notation_status==="passed").length/scored.length*100 : 0,
      critical:modeRows.filter((row)=>row.severity==="critical").length,
      time:avg(modeRows.flatMap((row)=>row.processing_ms==null?[]:[row.processing_ms/1000])),
      cost:avg(modeRows.flatMap((row)=>row.estimated_cost_usd==null?[]:[Number(row.estimated_cost_usd)])) };
  });
  const notice = params.error ?? params.success ?? (result.error ? "평가 DB 준비가 필요합니다. 관리자에게 문의해 주세요." : "");

  return <div className="space-y-6 text-slate-950">
    <section className="rounded-3xl bg-slate-950 p-6 text-white sm:p-8">
      <Link href="/admin" className="text-sm font-bold text-indigo-300">← 운영자 콘솔</Link>
      <h1 className="mt-4 text-3xl font-bold">수학 46문제 A/B 정확도 평가</h1>
      <p className="mt-3 text-sm text-slate-300">동일한 원본을 두 분석 방식으로 등록하고 문제 인식·정답·풀이·수식 표기를 비교합니다.</p>
      <div className="mt-6 flex flex-wrap gap-3"><Link href="/notes/new?evaluationMode=a" className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-950">A안 문제 등록</Link><Link href="/notes/new?evaluationMode=b" className="rounded-xl bg-indigo-500 px-4 py-3 text-sm font-bold">B안 문제 등록</Link></div>
    </section>
    {notice && <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{notice}</div>}
    <section className="grid gap-4 md:grid-cols-2">{summaries.map((item)=><div key={item.mode} className="rounded-3xl border bg-white p-6"><p className="font-bold text-indigo-600">{item.mode.toUpperCase()}안 · {item.mode==="a"?"Terra + 계산기":"Sol + 독립 Sol 검토 + 계산기"}</p><div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3"><Metric label="완료" value={`${item.count}/46`}/><Metric label="정답 정확도" value={`${item.answer.toFixed(1)}%`}/><Metric label="완전 성공률" value={`${item.complete.toFixed(1)}%`}/><Metric label="치명 오류" value={`${item.critical}건`}/><Metric label="평균 시간" value={`${item.time.toFixed(1)}초`}/><Metric label="평균 비용" value={`$${item.cost.toFixed(4)}`}/></div></div>)}</section>
    <form action={saveAiEvaluation} className="rounded-3xl border bg-white p-6"><h2 className="text-xl font-bold">문제별 평가 입력</h2><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Input name="problemNumber" label="문제 번호" type="number" min="1" max="46" required/><Select name="analysisMode" label="방식" options={[["a","A안"],["b","B안"]]}/><Input name="noteId" label="오답노트 ID(선택)"/>
      <Select name="recognitionStatus" label="문제 인식" options={[["passed","정상"],["failed","오류"],["unscorable","판정 불가"]]}/><Select name="answerStatus" label="최종 정답" options={[["passed","정답"],["failed","오답"],["unscorable","판정 불가"]]}/><Select name="solutionStatus" label="풀이 과정" options={[["passed","정상"],["partial","일부 오류"],["failed","오류"],["unscorable","판정 불가"]]}/><Select name="notationStatus" label="수식 표기" options={[["passed","정상"],["failed","깨짐"],["unscorable","판정 불가"]]}/><Select name="severity" label="심각도" options={[["normal","정상"],["minor","경미"],["major","주요"],["critical","치명적"],["unscorable","판정 불가"]]}/>
      <Input name="processingSeconds" label="처리시간(초)" type="number" min="0" step="0.1"/><Input name="estimatedCostUsd" label="비용(USD)" type="number" min="0" step="0.000001"/><div className="flex items-end gap-3 pb-3 text-sm"><label><input type="checkbox" name="retryRequired"/> 재시도</label><label><input type="checkbox" name="saveBlocked"/> 저장 차단</label></div>
    </div><label className="mt-4 block text-xs font-bold">메모<textarea name="notes" maxLength={2000} rows={3} className={inputClass}/></label><button className="mt-4 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white">평가 저장</button></form>
    <section className="rounded-3xl border bg-white p-6"><h2 className="text-xl font-bold">진행표</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="border-b text-xs text-slate-400"><th className="py-3">번호</th><th>방식</th><th>인식</th><th>정답</th><th>풀이</th><th>표기</th><th>심각도</th><th>시간</th><th>비용</th></tr></thead><tbody>{rows.map((row)=><tr key={row.id} className="border-b"><td className="py-3 font-bold">{row.problem_number}</td><td>{row.analysis_mode.toUpperCase()}</td><td>{row.recognition_status}</td><td>{row.answer_status}</td><td>{row.solution_status}</td><td>{row.notation_status}</td><td>{row.severity}</td><td>{row.processing_ms==null?"-":`${(row.processing_ms/1000).toFixed(1)}초`}</td><td>{row.estimated_cost_usd==null?"-":`$${Number(row.estimated_cost_usd).toFixed(4)}`}</td></tr>)}</tbody></table></div></section>
  </div>;
}

function Metric({label,value}:{label:string;value:string}){return <div><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div>}
function Input({name,label,...props}:{name:string;label:string}&React.InputHTMLAttributes<HTMLInputElement>){return <label className="text-xs font-bold">{label}<input name={name} {...props} className={inputClass}/></label>}
function Select({name,label,options}:{name:string;label:string;options:string[][]}){return <label className="text-xs font-bold">{label}<select name={name} className={inputClass}>{options.map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></label>}
