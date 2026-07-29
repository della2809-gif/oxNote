"use client";

import { useEffect, useRef, useState } from "react";

type Crop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DragState = {
  mode: "move" | "resize";
  startX: number;
  startY: number;
  crop: Crop;
};

const MIN_CROP = 0.12;
const TARGET_BYTES = 1.8 * 1024 * 1024;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

async function canvasToCompressedBlob(canvas: HTMLCanvasElement) {
  let quality = 0.88;
  let blob: Blob | null = null;

  while (quality >= 0.56) {
    blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (blob && blob.size <= TARGET_BYTES) return blob;
    quality -= 0.08;
  }

  return blob;
}

export async function compressImageFile(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const maxDimension = 2200;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이미지를 처리할 수 없습니다.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToCompressedBlob(canvas);
    if (!blob) throw new Error("이미지를 압축하지 못했습니다.");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}

async function cropImage(file: File, crop: Crop) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const sourceX = Math.round(bitmap.width * crop.x);
    const sourceY = Math.round(bitmap.height * crop.y);
    const sourceWidth = Math.max(1, Math.round(bitmap.width * crop.width));
    const sourceHeight = Math.max(1, Math.round(bitmap.height * crop.height));
    const maxDimension = 2200;
    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이미지를 처리할 수 없습니다.");
    context.drawImage(
      bitmap,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    const blob = await canvasToCompressedBlob(canvas);
    if (!blob) throw new Error("이미지를 자르지 못했습니다.");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + "-crop.jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}

export default function ImageCropper({
  file,
  onCancel,
  onComplete,
}: {
  file: File;
  onCancel: () => void;
  onComplete: (file: File) => void;
}) {
  const [previewUrl] = useState(() => URL.createObjectURL(file));
  const [crop, setCrop] = useState<Crop>({ x: 0.05, y: 0.12, width: 0.9, height: 0.76 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const imageWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function updateDrag(clientX: number, clientY: number) {
    if (!drag || !imageWrapRef.current) return;
    const bounds = imageWrapRef.current.getBoundingClientRect();
    const deltaX = (clientX - drag.startX) / bounds.width;
    const deltaY = (clientY - drag.startY) / bounds.height;

    if (drag.mode === "move") {
      setCrop({
        ...drag.crop,
        x: clamp(drag.crop.x + deltaX, 0, 1 - drag.crop.width),
        y: clamp(drag.crop.y + deltaY, 0, 1 - drag.crop.height),
      });
      return;
    }

    setCrop({
      ...drag.crop,
      width: clamp(drag.crop.width + deltaX, MIN_CROP, 1 - drag.crop.x),
      height: clamp(drag.crop.height + deltaY, MIN_CROP, 1 - drag.crop.y),
    });
  }

  async function confirmCrop() {
    setIsProcessing(true);
    setError("");
    try {
      onComplete(await cropImage(file, crop));
    } catch {
      setError("사진을 자르지 못했습니다. 다른 사진을 선택하거나 다시 촬영해 주세요.");
      setIsProcessing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-3 sm:p-6">
      <div className="flex max-h-[96vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">문제 영역 자르기</h2>
          <p className="mt-1 text-sm text-slate-500">
            밝은 테두리 안에 문제와 선택지가 모두 들어오도록 이동하고 크기를 조절하세요.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-900 p-3 sm:p-5">
          <div className="flex min-h-full items-center justify-center">
            <div ref={imageWrapRef} className="relative inline-block max-w-full touch-none select-none">
              {previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="자를 문제 사진"
                  className="block max-h-[64vh] max-w-full"
                  draggable={false}
                />
              )}
              <div className="pointer-events-none absolute inset-0 bg-slate-950/55" />
              <div
                role="presentation"
                className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(15,23,42,0.15)]"
                style={{
                  left: `${crop.x * 100}%`,
                  top: `${crop.y * 100}%`,
                  width: `${crop.width * 100}%`,
                  height: `${crop.height * 100}%`,
                  backgroundImage:
                    "linear-gradient(to right,rgba(255,255,255,.45) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,.45) 1px,transparent 1px)",
                  backgroundSize: "33.333% 33.333%",
                }}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDrag({
                    mode: "move",
                    startX: event.clientX,
                    startY: event.clientY,
                    crop,
                  });
                }}
                onPointerMove={(event) => updateDrag(event.clientX, event.clientY)}
                onPointerUp={() => setDrag(null)}
                onPointerCancel={() => setDrag(null)}
              >
                <span
                  role="presentation"
                  className="absolute -bottom-3 -right-3 h-7 w-7 cursor-se-resize rounded-full border-2 border-white bg-indigo-600 shadow-lg"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDrag({
                      mode: "resize",
                      startX: event.clientX,
                      startY: event.clientY,
                      crop,
                    });
                  }}
                  onPointerMove={(event) => updateDrag(event.clientX, event.clientY)}
                  onPointerUp={() => setDrag(null)}
                  onPointerCancel={() => setDrag(null)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 bg-white p-4 sm:px-5">
          {error && <p className="mb-3 text-sm font-medium text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isProcessing}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-600 disabled:opacity-50"
            >
              다시 촬영
            </button>
            <button
              type="button"
              onClick={confirmCrop}
              disabled={isProcessing}
              className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-400"
            >
              {isProcessing ? "사진 처리 중..." : "이 영역 사용"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
