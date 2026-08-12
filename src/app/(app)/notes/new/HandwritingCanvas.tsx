"use client";

import { useEffect, useRef, useState } from "react";
import type { HandwritingArtifact, HandwritingPoint, HandwritingStroke } from "@/lib/types";

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;
const MIN_ZOOM = 0.75;
const MAX_ZOOM = 2.5;

type Tool = "pen" | "eraser" | "pan";

type ReadyPayload = {
  file: File;
  artifact: HandwritingArtifact;
  recognizedText: string;
  recognizedLatex: string;
};

type RecognitionResponse = {
  recognizedText?: string;
  latex?: string;
  confidence?: "low" | "medium" | "high";
  warnings?: string[];
  error?: string;
};

export default function HandwritingCanvas({
  onReady,
  onError,
  onSolve,
}: {
  onReady: (payload: ReadyPayload | null) => void;
  onError: (message: string) => void;
  onSolve: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<HandwritingStroke[]>([]);
  const redoRef = useRef<HandwritingStroke[]>([]);
  const activeStrokeRef = useRef<HandwritingStroke | null>(null);
  const activePointerRef = useRef<number | null>(null);
  const recentPenAtRef = useRef(0);
  const panStartRef = useRef<{ pointerId: number; x: number; y: number; tx: number; ty: number } | null>(null);
  const transformRef = useRef({ zoom: 1, x: 0, y: 0 });
  const [tool, setTool] = useState<Tool>("pen");
  const [penWidth, setPenWidth] = useState(4);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [strokeCount, setStrokeCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognizedText, setRecognizedText] = useState("");
  const [recognizedLatex, setRecognizedLatex] = useState("");
  const [confidence, setConfidence] = useState<"low" | "medium" | "high" | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [readyFile, setReadyFile] = useState<File | null>(null);

  function context() {
    const canvas = canvasRef.current;
    return canvas?.getContext("2d", { alpha: true }) ?? null;
  }

  function pressureWidth(stroke: HandwritingStroke, pressure: number) {
    if (stroke.tool === "eraser") return stroke.width * 4;
    const normalized = pressure > 0 ? pressure : 0.5;
    return stroke.width * (0.55 + normalized * 0.9);
  }

  function drawStrokeSegment(stroke: HandwritingStroke, from: HandwritingPoint, to: HandwritingPoint) {
    const ctx = context();
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = stroke.color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = pressureWidth(stroke, (from.pressure + to.pressure) / 2);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  function redraw() {
    const canvas = canvasRef.current;
    const ctx = context();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokesRef.current) {
      if (stroke.points.length === 1) {
        const point = stroke.points[0];
        drawStrokeSegment(stroke, point, { ...point, x: point.x + 0.01, y: point.y + 0.01 });
        continue;
      }
      for (let index = 1; index < stroke.points.length; index += 1) {
        drawStrokeSegment(stroke, stroke.points[index - 1], stroke.points[index]);
      }
    }
  }

  useEffect(() => {
    redraw();
    // Canvas pixels are intentionally redrawn only when a stroke is completed or history changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyVersion]);

  function applyTransform(next = transformRef.current) {
    transformRef.current = next;
    setZoom(next.zoom);
    const canvas = canvasRef.current;
    if (canvas) canvas.style.transform = `translate3d(${next.x}px, ${next.y}px, 0) scale(${next.zoom})`;
  }

  function invalidateRecognition() {
    if (!recognizedText && !readyFile) return;
    setRecognizedText("");
    setRecognizedLatex("");
    setConfidence(null);
    setWarnings([]);
    setReadyFile(null);
    onReady(null);
  }

  function pointFromClient(clientX: number, clientY: number, pressure: number): HandwritingPoint {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(CANVAS_WIDTH, ((clientX - rect.left) / rect.width) * CANVAS_WIDTH)),
      y: Math.max(0, Math.min(CANVAS_HEIGHT, ((clientY - rect.top) / rect.height) * CANVAS_HEIGHT)),
      pressure: pressure > 0 ? Number(pressure.toFixed(3)) : 0.5,
      timestamp: Date.now(),
    };
  }

  function pointerType(event: React.PointerEvent<HTMLCanvasElement>): HandwritingStroke["pointerType"] {
    return event.pointerType === "pen" || event.pointerType === "touch" ? event.pointerType : "mouse";
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    if (event.pointerType === "pen") recentPenAtRef.current = Date.now();
    if (event.pointerType === "touch" && Date.now() - recentPenAtRef.current < 1200) return;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === "pan") {
      const current = transformRef.current;
      panStartRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        tx: current.x,
        ty: current.y,
      };
      return;
    }
    if (activePointerRef.current !== null) return;
    activePointerRef.current = event.pointerId;
    const point = pointFromClient(event.clientX, event.clientY, event.pressure);
    const stroke: HandwritingStroke = {
      id: crypto.randomUUID(),
      tool,
      pointerType: pointerType(event),
      color: "#111827",
      width: penWidth,
      points: [point],
    };
    activeStrokeRef.current = stroke;
    drawStrokeSegment(stroke, point, { ...point, x: point.x + 0.01, y: point.y + 0.01 });
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const pan = panStartRef.current;
    if (pan?.pointerId === event.pointerId) {
      const next = {
        ...transformRef.current,
        x: pan.tx + event.clientX - pan.x,
        y: pan.ty + event.clientY - pan.y,
      };
      transformRef.current = next;
      const canvas = canvasRef.current;
      if (canvas) canvas.style.transform = `translate3d(${next.x}px, ${next.y}px, 0) scale(${next.zoom})`;
      return;
    }
    if (activePointerRef.current !== event.pointerId || !activeStrokeRef.current) return;

    const nativeEvent = event.nativeEvent;
    const coalesced = typeof nativeEvent.getCoalescedEvents === "function"
      ? nativeEvent.getCoalescedEvents()
      : [nativeEvent];
    for (const sample of coalesced) {
      const next = pointFromClient(sample.clientX, sample.clientY, sample.pressure);
      const points = activeStrokeRef.current.points;
      const previous = points[points.length - 1];
      if (Math.hypot(next.x - previous.x, next.y - previous.y) < 0.45) continue;
      points.push(next);
      drawStrokeSegment(activeStrokeRef.current, previous, next);
    }
  }

  function finishPointer(event: React.PointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    if (panStartRef.current?.pointerId === event.pointerId) {
      panStartRef.current = null;
      setZoom(transformRef.current.zoom);
      return;
    }
    if (activePointerRef.current !== event.pointerId || !activeStrokeRef.current) return;
    strokesRef.current.push(activeStrokeRef.current);
    redoRef.current = [];
    setStrokeCount(strokesRef.current.length);
    setRedoCount(0);
    activeStrokeRef.current = null;
    activePointerRef.current = null;
    invalidateRecognition();
    setHistoryVersion((value) => value + 1);
  }

  function undo() {
    const stroke = strokesRef.current.pop();
    if (!stroke) return;
    redoRef.current.push(stroke);
    setStrokeCount(strokesRef.current.length);
    setRedoCount(redoRef.current.length);
    invalidateRecognition();
    setHistoryVersion((value) => value + 1);
  }

  function redo() {
    const stroke = redoRef.current.pop();
    if (!stroke) return;
    strokesRef.current.push(stroke);
    setStrokeCount(strokesRef.current.length);
    setRedoCount(redoRef.current.length);
    invalidateRecognition();
    setHistoryVersion((value) => value + 1);
  }

  function clearAll() {
    if (strokesRef.current.length === 0) return;
    strokesRef.current = [];
    redoRef.current = [];
    setStrokeCount(0);
    setRedoCount(0);
    invalidateRecognition();
    setHistoryVersion((value) => value + 1);
  }

  function canvasBlob(type: "image/webp" | "image/png" = "image/webp") {
    return new Promise<Blob>((resolve, reject) => {
      const source = canvasRef.current;
      if (!source) return reject(new Error("필기 영역을 찾을 수 없습니다."));
      const output = document.createElement("canvas");
      output.width = CANVAS_WIDTH;
      output.height = CANVAS_HEIGHT;
      const ctx = output.getContext("2d");
      if (!ctx) return reject(new Error("이미지를 만들 수 없습니다."));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, output.width, output.height);
      ctx.drawImage(source, 0, 0);
      output.toBlob((blob) => {
        if (blob) resolve(blob);
        else if (type === "image/webp") {
          output.toBlob((png) => png ? resolve(png) : reject(new Error("이미지를 만들 수 없습니다.")), "image/png");
        } else reject(new Error("이미지를 만들 수 없습니다."));
      }, type, 0.92);
    });
  }

  function artifact(text: string, latex: string): HandwritingArtifact {
    return {
      kind: "handwriting",
      version: 1,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      strokes: strokesRef.current,
      recognizedText: text,
      recognizedLatex: latex,
    };
  }

  async function recognize() {
    if (strokesRef.current.length === 0 || isRecognizing) {
      onError("필기 영역에 문제를 먼저 작성해 주세요.");
      return;
    }
    setIsRecognizing(true);
    onError("");
    try {
      const blob = await canvasBlob();
      const extension = blob.type === "image/png" ? "png" : "webp";
      const file = new File([blob], `handwriting-${Date.now()}.${extension}`, { type: blob.type });
      const body = new FormData();
      body.set("image", file);
      const requestId = crypto.randomUUID();
      const response = await fetch("/api/handwriting/recognize", {
        method: "POST",
        body,
        headers: { "X-Request-Id": requestId },
      });
      if (response.status === 401) {
        window.location.href = "/login?next=/notes/new";
        return;
      }
      const result = await response.json() as RecognitionResponse;
      if (!response.ok || !result.recognizedText) throw new Error(result.error ?? "손글씨를 인식하지 못했습니다.");
      const text = result.recognizedText;
      const latex = result.latex ?? "";
      setRecognizedText(text);
      setRecognizedLatex(latex);
      setConfidence(result.confidence ?? null);
      setWarnings(result.warnings ?? []);
      setReadyFile(file);
      onReady({ file, artifact: artifact(text, latex), recognizedText: text, recognizedLatex: latex });
    } catch (error) {
      onError(error instanceof Error ? error.message : "손글씨 인식 중 오류가 발생했습니다.");
    } finally {
      setIsRecognizing(false);
    }
  }

  function updateRecognition(text: string, latex: string) {
    setRecognizedText(text);
    setRecognizedLatex(latex);
    if (readyFile) onReady({ file: readyFile, artifact: artifact(text, latex), recognizedText: text, recognizedLatex: latex });
  }

  function changeZoom(delta: number) {
    const current = transformRef.current;
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number((current.zoom + delta).toFixed(2))));
    applyTransform({ ...current, zoom: nextZoom });
  }

  const buttonClass = "min-h-11 rounded-xl border px-3 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <button type="button" onClick={() => setTool("pen")} aria-pressed={tool === "pen"} className={`${buttonClass} ${tool === "pen" ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 text-slate-700"}`}>✏️ 펜</button>
        <button type="button" onClick={() => setTool("eraser")} aria-pressed={tool === "eraser"} className={`${buttonClass} ${tool === "eraser" ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-700"}`}>지우개</button>
        <button type="button" onClick={() => setTool("pan")} aria-pressed={tool === "pan"} className={`${buttonClass} ${tool === "pan" ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-700"}`}>이동</button>
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600">
          굵기
          <input aria-label="펜 굵기" type="range" min="2" max="14" value={penWidth} onChange={(event) => setPenWidth(Number(event.target.value))} className="w-20 accent-indigo-600" />
        </label>
        <button type="button" onClick={undo} disabled={strokeCount === 0} className={`${buttonClass} border-slate-200 text-slate-700`}>↶ <span className="sr-only">실행 취소</span></button>
        <button type="button" onClick={redo} disabled={redoCount === 0} className={`${buttonClass} border-slate-200 text-slate-700`}>↷ <span className="sr-only">다시 실행</span></button>
        <button type="button" onClick={clearAll} disabled={strokeCount === 0} className={`${buttonClass} border-red-100 text-red-600`}>전체 지우기</button>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => changeZoom(-0.25)} className={`${buttonClass} border-slate-200 text-slate-700`}>−</button>
          <button type="button" onClick={() => applyTransform({ zoom: 1, x: 0, y: 0 })} className={`${buttonClass} border-slate-200 text-slate-700`}>{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => changeZoom(0.25)} className={`${buttonClass} border-slate-200 text-slate-700`}>＋</button>
        </span>
      </div>

      <div className="relative aspect-[3/2] w-full overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-white shadow-inner" style={{ touchAction: "none", overscrollBehavior: "contain" }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          aria-label="손글씨 문제 필기 영역"
          className={`absolute inset-0 h-full w-full origin-top-left bg-white ${tool === "pan" ? "cursor-grab" : tool === "eraser" ? "cursor-cell" : "cursor-crosshair"}`}
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishPointer}
          onPointerCancel={finishPointer}
          onContextMenu={(event) => event.preventDefault()}
        />
        {strokeCount === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center text-sm font-semibold text-slate-300">
            손가락이나 펜으로 문제를 작성해 주세요
          </div>
        )}
      </div>
      <p className="text-xs leading-5 text-slate-500">스타일러스 입력을 우선하며, 지원 기기에서는 필압에 따라 선 굵기가 달라집니다. 화면 이동이 필요하면 ‘이동’을 선택하세요.</p>

      {!recognizedText ? (
        <button type="button" onClick={recognize} disabled={isRecognizing || strokeCount === 0} className="min-h-12 w-full rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
          {isRecognizing ? "손글씨를 인식하고 있어요..." : "작성 완료"}
        </button>
      ) : (
        <section className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 sm:p-5" aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-indigo-600">이렇게 인식했어요</p>
              <p className="mt-1 text-xs text-slate-500">잘못 읽힌 글자나 수식은 직접 고친 뒤 문제를 풀 수 있어요.</p>
            </div>
            {confidence && <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500">인식 신뢰도 {confidence === "high" ? "높음" : confidence === "medium" ? "보통" : "낮음"}</span>}
          </div>
          <textarea aria-label="인식된 문제" value={recognizedText} onChange={(event) => updateRecognition(event.target.value, recognizedLatex)} rows={5} className="mt-4 w-full rounded-xl border border-indigo-100 bg-white px-4 py-3 text-sm leading-6 text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
          {(recognizedLatex || /[0-9=+\-*/^]/.test(recognizedText)) && (
            <label className="mt-3 block space-y-2 text-xs font-bold text-slate-600">
              <span>인식된 수식·LaTeX <span className="font-normal text-slate-400">(선택 수정)</span></span>
              <textarea value={recognizedLatex} onChange={(event) => updateRecognition(recognizedText, event.target.value)} rows={2} className="w-full rounded-xl border border-indigo-100 bg-white px-4 py-3 font-mono text-sm text-slate-800 outline-none focus:border-indigo-400" />
            </label>
          )}
          {warnings.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-amber-700">
              {warnings.map((warning, index) => <li key={`${warning}-${index}`}>확인 필요: {warning}</li>)}
            </ul>
          )}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => { setRecognizedText(""); setRecognizedLatex(""); setReadyFile(null); onReady(null); }} className="min-h-12 rounded-xl border border-indigo-200 bg-white px-4 py-3 text-sm font-bold text-indigo-700">수정하기</button>
            <button type="button" onClick={onSolve} disabled={!recognizedText.trim()} className="min-h-12 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300">문제 풀기</button>
          </div>
        </section>
      )}
    </div>
  );
}
