import { createClient } from "@/lib/supabase/server";
import { canExportLearningData } from "@/lib/data-export-access";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: accessSubscription, error: accessError } = await supabase
    .from("subscriptions")
    .select("plan_id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (accessError) {
    return Response.json(
      { error: "학습 데이터 내려받기 권한을 확인하지 못했습니다." },
      { status: 500 },
    );
  }

  if (!canExportLearningData(accessSubscription)) {
    return Response.json(
      { error: "유료 신청 후 운영자 승인이 필요한 기능입니다." },
      { status: 403 },
    );
  }

  const [{ data: profile }, { data: subjects }, { data: notes }, { data: reviewLogs }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("subjects").select("*").order("created_at"),
      supabase.from("notes").select("*").order("created_at"),
      supabase.from("review_logs").select("*").order("reviewed_at"),
    ]);

  const exportedAt = new Date().toISOString();
  const body = JSON.stringify(
    {
      exported_at: exportedAt,
      account: { id: user.id, email: user.email, profile },
      subscription: accessSubscription,
      subjects: subjects ?? [],
      notes: notes ?? [],
      review_logs: reviewLogs ?? [],
    },
    null,
    2,
  );

  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="xonote-data-${exportedAt.slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
