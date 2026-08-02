import "server-only";

type SupportInquiryEmail = {
  inquiryId: string;
  category: string;
  subject: string;
  message: string;
  memberName: string;
  memberEmail: string;
};

type NotificationResult =
  | { status: "sent"; id: string }
  | { status: "failed"; error: string }
  | { status: "not_configured"; error: string };

const CATEGORY_LABELS: Record<string, string> = {
  service: "서비스 이용",
  account: "계정",
  billing: "결제·구독",
  technical: "오류·기술 지원",
  other: "기타",
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendSupportInquiryNotification(
  inquiry: SupportInquiryEmail,
): Promise<NotificationResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.SUPPORT_NOTIFICATION_TO
    ?.split(",")
    .map((email) => email.trim())
    .filter(Boolean);
  const from = process.env.SUPPORT_NOTIFICATION_FROM?.trim();

  if (!apiKey || !to?.length || !from) {
    return {
      status: "not_configured",
      error: "RESEND_API_KEY, SUPPORT_NOTIFICATION_TO, SUPPORT_NOTIFICATION_FROM 설정이 필요합니다.",
    };
  }

  const categoryLabel = CATEGORY_LABELS[inquiry.category] ?? "이용 문의";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `support-inquiry-${inquiry.inquiryId}`,
    },
    body: JSON.stringify({
      from,
      to,
      ...(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inquiry.memberEmail)
        ? { reply_to: inquiry.memberEmail }
        : {}),
      subject: `[xonote 이용문의] ${inquiry.subject}`,
      text: [
        `문의 유형: ${categoryLabel}`,
        `회원: ${inquiry.memberName}`,
        `회원 이메일: ${inquiry.memberEmail}`,
        `문의 ID: ${inquiry.inquiryId}`,
        "",
        inquiry.message,
      ].join("\n"),
      html: `
        <h2>xonote 이용문의가 접수되었습니다.</h2>
        <p><strong>문의 유형:</strong> ${escapeHtml(categoryLabel)}</p>
        <p><strong>회원:</strong> ${escapeHtml(inquiry.memberName)}</p>
        <p><strong>회원 이메일:</strong> ${escapeHtml(inquiry.memberEmail)}</p>
        <p><strong>문의 ID:</strong> ${escapeHtml(inquiry.inquiryId)}</p>
        <hr />
        <p><strong>제목:</strong> ${escapeHtml(inquiry.subject)}</p>
        <p style="white-space: pre-wrap">${escapeHtml(inquiry.message)}</p>
      `,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { id?: string; message?: string; error?: string }
    | null;

  if (!response.ok || !payload?.id) {
    return {
      status: "failed",
      error: payload?.message ?? payload?.error ?? `Resend API 오류 (${response.status})`,
    };
  }

  return { status: "sent", id: payload.id };
}
