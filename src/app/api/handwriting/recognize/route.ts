import { recognizeHandwritingImage } from "@/lib/analyze";
import { finalizeAiUsage, reserveAiUsage, usageErrorMessage } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

const MAX_HANDWRITING_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/webp", "image/jpeg"]);

function isTrustedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    if (originUrl.origin === requestUrl.origin) return true;
    const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
    return process.env.NODE_ENV !== "production"
      && localHosts.has(originUrl.hostname)
      && localHosts.has(requestUrl.hostname)
      && originUrl.protocol === requestUrl.protocol
      && originUrl.port === requestUrl.port;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처입니다." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    return Response.json({ error: "multipart/form-data is required" }, { status: 415 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return Response.json({ error: "인식할 손글씨 이미지가 없습니다." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(image.type) || image.size > MAX_HANDWRITING_IMAGE_BYTES) {
    return Response.json({ error: "8MB 이하의 PNG, WebP 또는 JPG 이미지만 사용할 수 있습니다." }, { status: 413 });
  }

  const base64 = Buffer.from(await image.arrayBuffer()).toString("base64");
  const requestId = request.headers.get("x-request-id")?.slice(0, 120) || crypto.randomUUID();
  const reservation = await reserveAiUsage(user.id, "file_analysis", supabase, requestId);
  if (!reservation.allowed) {
    return Response.json(
      { error: usageErrorMessage(reservation.reason), reason: reservation.reason },
      { status: reservation.reason === "rate_limited" ? 429 : 402 },
    );
  }

  let result;
  try {
    result = await recognizeHandwritingImage({
      imageBase64: base64,
      mimeType: image.type,
      signal: request.signal,
    });
  } catch (error) {
    await finalizeAiUsage({
      userId: user.id,
      requestKey: reservation.requestKey,
      succeeded: false,
      failureReason: error instanceof Error ? error.message.slice(0, 300) : "OpenAI handwriting recognition failed",
      existingClient: supabase,
    });
    return Response.json({ error: "손글씨를 인식하는 중 오류가 발생했습니다. 다시 시도해 주세요." }, { status: 502 });
  }
  await finalizeAiUsage({
    userId: user.id,
    requestKey: reservation.requestKey,
    succeeded: result.succeeded,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    failureReason: result.succeeded ? undefined : "OpenAI handwriting recognition failed",
    existingClient: supabase,
  });

  if (!result.succeeded || !result.recognizedText) {
    return Response.json({ error: "손글씨를 인식하지 못했습니다. 조금 더 크게 작성해 주세요." }, { status: 422 });
  }

  return Response.json(result);
}
