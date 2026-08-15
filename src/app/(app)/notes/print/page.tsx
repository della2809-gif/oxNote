import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Note, NoteAiDetails, Subject } from "@/lib/types";
import MathText from "@/components/MathText";
import PrintToolbar, { type PrintLayout, type PrintSection } from "./PrintToolbar";

const VALID_SECTIONS = new Set<PrintSection>(["source", "analysis", "steps", "review", "reason"]);
const DEFAULT_SECTIONS: PrintSection[] = ["source"];

function asDetails(value: unknown): Partial<NoteAiDetails> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Partial<NoteAiDetails> : {};
}

function compactText(value: string | null | undefined, maxLength: number) {
  const text = value?.trim() ?? "";
  return text.length <= maxLength ? text : `${text.slice(0, maxLength).trim()}…`;
}

function readSections(raw: string | string[] | undefined) {
  if (raw === undefined) return DEFAULT_SECTIONS;
  const value = Array.isArray(raw) ? raw.join(",") : raw;
  const parsed = Array.from(new Set(value.split(",").filter((item): item is PrintSection => VALID_SECTIONS.has(item as PrintSection))));
  return parsed;
}

function readLayout(raw: string | string[] | undefined): PrintLayout {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "answer" ? value : "worksheet";
}

type PrintableNote = { note: Note; details: Partial<NoteAiDetails>; subject: Subject | null };

export default async function PrintNotesPage({ searchParams }: { searchParams: Promise<{ ids?: string | string[]; sections?: string | string[]; layout?: string | string[] }> }) {
  const params = await searchParams;
  const rawIds = Array.isArray(params.ids) ? params.ids : params.ids ? [params.ids] : [];
  const ids = Array.from(new Set(rawIds)).slice(0, 20);
  const sections = readSections(params.sections);
  const layout = readLayout(params.layout);

  if (ids.length === 0) return <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center"><h1 className="text-xl font-bold">인쇄할 문제를 선택해 주세요</h1><p className="mt-2 text-sm text-slate-500">오답노트 목록에서 체크박스로 문제를 선택할 수 있습니다.</p><Link href="/notes" className="mt-5 inline-flex rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white">오답노트로 돌아가기</Link></div>;

  const supabase = await createClient();
  const [{ data: notesData }, { data: subjectsData }] = await Promise.all([
    supabase.from("notes").select("id, subject_id, source, source_file_url, question, my_answer, correct_answer, ai_analysis, ai_details, user_mistake_reason, box_level").in("id", ids),
    supabase.from("subjects").select("id, name, color"),
  ]);
  const notes = (notesData as Note[] | null) ?? [];
  const noteMap = new Map(notes.map((note) => [note.id, note]));
  const orderedNotes = ids.map((id) => noteMap.get(id)).filter((note): note is Note => Boolean(note));
  const subjectMap = new Map(((subjectsData as Subject[] | null) ?? []).map((subject) => [subject.id, subject]));
  const printable: PrintableNote[] = orderedNotes.map((note) => {
    const details = asDetails(note.ai_details);
    return {
      note,
      details,
      subject: note.subject_id ? subjectMap.get(note.subject_id) ?? null : null,
    };
  });

  return (
    <div className="print-document mx-auto max-w-[210mm]">
      <PrintToolbar count={printable.length} initialSections={sections} initialLayout={layout} />
      <div className={`print-layout print-layout-${layout}`}>
        {layout === "worksheet" ? (
          <>
            {sections.includes("source") && <section className="print-sheet-grid print-exam-section">{printable.map((item, index) => <NoteSheet key={`problem-${item.note.id}`} item={item} index={index} total={printable.length} sections={["source"]} variant="problem" />)}</section>}
            {sections.some((section) => section !== "source") && <section className="print-sheet-grid print-answer-section">{printable.map((item, index) => <NoteSheet key={`answer-${item.note.id}`} item={item} index={index} total={printable.length} sections={sections.filter((section) => section !== "source")} variant="solution" />)}</section>}
          </>
        ) : <section className="print-solution-stream">{printable.map((item, index) => <NoteSheet key={item.note.id} item={item} index={index} total={printable.length} sections={sections} variant="answer" />)}</section>}
      </div>
    </div>
  );
}

function NoteSheet({ item, index, total, sections, variant }: { item: PrintableNote; index: number; total: number; sections: PrintSection[]; variant: "problem" | "solution" | "answer" }) {
  const { note, details, subject } = item;
  const has = (section: PrintSection) => sections.includes(section);
  const steps = Array.isArray(details.solutionSteps) ? details.solutionSteps.slice(0, 5) : [];
  const points = Array.isArray(details.confusionPoints) ? details.confusionPoints.slice(0, 4) : [];
  return (
    <article className={`print-sheet ${variant === "problem" ? "print-problem-sheet" : ""}`}>
      {variant !== "problem" && <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
        <div><p className="text-[9px] font-bold uppercase tracking-[0.18em] text-indigo-600">xonote · {variant === "solution" ? "해설지" : variant === "answer" ? "풀이 복습" : "AI 오답노트"}</p><div className="flex items-start gap-2"><strong className="print-question-number text-lg">{index + 1}</strong><h1 className="mt-1.5 text-base font-bold leading-tight">{compactText(details.title || note.question, 100)}</h1></div><div className="mt-2 flex flex-wrap gap-1.5 text-[8px] font-semibold">{subject && <span className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-700">{subject.name}</span>}{note.source && <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{compactText(note.source, 40)}</span>}</div></div>
        <span className="shrink-0 text-[9px] text-slate-400">{index + 1} / {total}</span>
      </header>}

      <div className="mt-3 grid grid-cols-1 gap-3">
        {has("source") && <PrintBox title={variant === "problem" ? "" : "문제 전문"} color="text-indigo-600" className="print-question-box">
          {variant === "problem" ? (
            <div className="print-problem-row">
              <strong className="print-problem-number" aria-label={`${index + 1}번 문제`}>{index + 1}</strong>
              <QuestionTranscript value={note.question} />
            </div>
          ) : <QuestionTranscript value={note.question} />}
        </PrintBox>}
        {has("analysis") && <PrintBox title="핵심 개념과 정답" color="text-emerald-600"><dl className="mt-2 rounded-lg bg-slate-50 p-3 text-[8px]"><dt className="font-bold text-slate-400">핵심 개념</dt><dd className="mt-1 font-semibold"><MathText>{details.coreConcepts?.slice(0, 5).join(" · ") || "-"}</MathText></dd><dt className="mt-2 font-bold text-slate-400">정답</dt><dd className="mt-1 font-semibold text-emerald-600"><MathText>{compactText(details.answerSummary || note.correct_answer, 180)}</MathText></dd></dl></PrintBox>}
      </div>

      {has("steps") && <PrintBox title="단계별 풀이" color="text-indigo-600" className="mt-3"><div className={`mt-2 grid gap-3 ${variant === "answer" ? "grid-cols-1" : "grid-cols-2"}`}>{steps.length ? steps.map((step, stepIndex) => <div key={`${step.title}-${stepIndex}`} className="grid grid-cols-[20px_1fr] gap-2 border-t border-slate-100 pt-2"><span className="grid h-5 w-5 place-items-center rounded-md bg-indigo-50 text-[8px] font-bold text-indigo-600">{stepIndex + 1}</span><div><p className="text-[8px] font-bold">{compactText(step.title, 60)}</p><p className="mt-1 text-[8px] leading-[1.55] text-slate-600">{compactText(`${step.explanation} ${step.formula}`, variant === "answer" ? 420 : 230)}</p></div></div>) : <p className="text-[8px] text-slate-500">{compactText(note.ai_analysis, 800) || "저장된 단계별 풀이가 없습니다."}</p>}</div></PrintBox>}

      {(has("review") || has("reason")) && <div className={`mt-3 grid gap-3 ${has("review") && has("reason") ? "grid-cols-2" : "grid-cols-1"}`}>{has("review") && <PrintBox title="다시 확인할 지점" color="text-amber-600"><ol className="mt-2 space-y-2">{points.length ? points.map((point, pointIndex) => <li key={`${point.title}-${pointIndex}`} className="text-[8px] leading-[1.5] text-slate-600"><strong className="text-slate-800">{pointIndex + 1}. {compactText(point.title, 55)}</strong> · {compactText(`${point.explanation} ${point.correction}`, 210)}</li>) : <li className="text-[8px] text-slate-400">저장된 확인 지점이 없습니다.</li>}</ol></PrintBox>}{has("reason") && <PrintBox title="내가 틀린 이유" color="text-rose-600"><p className="mt-2 min-h-[25mm] whitespace-pre-wrap rounded-lg bg-rose-50/60 p-3 text-[8px] leading-[1.6]">{compactText(note.user_mistake_reason, 500) || "직접 작성한 오답 이유가 없습니다."}</p></PrintBox>}</div>}
      <footer className="mt-auto flex justify-between border-t border-slate-100 pt-2 text-[7px] text-slate-400"><span>복습 단계 · Box {note.box_level} / 5</span><span>{new Date().toLocaleDateString("ko-KR")}</span></footer>
    </article>
  );
}

function QuestionTranscript({ value }: { value: string }) {
  const lines = value.trim().split(/\r?\n/);
  const content: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const next = lines[index + 1] ?? "";
    if (line.includes("|") && /^\s*\|?\s*:?-{3,}/.test(next)) {
      const rows: string[][] = [];
      const headers = line.split("|").map((cell) => cell.trim()).filter(Boolean);
      index += 2;
      while (index < lines.length && lines[index].includes("|")) {
        rows.push(lines[index].split("|").map((cell) => cell.trim()).filter(Boolean));
        index += 1;
      }
      content.push(<table key={`table-${index}`} className="print-question-table"><thead><tr>{headers.map((cell, cellIndex) => <th key={cellIndex}><MathText>{cell}</MathText></th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}><MathText>{cell}</MathText></td>)}</tr>)}</tbody></table>);
      continue;
    }
    content.push(line.trim() ? <p key={index}><MathText>{line}</MathText></p> : <span key={index} className="block h-2" />);
    index += 1;
  }

  return <div className="print-question-transcript">{content}</div>;
}

function PrintBox({ title, color, className = "", children }: { title: string; color: string; className?: string; children: React.ReactNode }) {
  return <section className={`${className} rounded-xl border border-slate-200 p-3`}>{title && <p className={`text-[8px] font-bold ${color}`}>{title}</p>}{children}</section>;
}
