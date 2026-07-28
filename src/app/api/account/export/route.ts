import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ data: profile }, { data: subjects }, { data: notes }, { data: reviewLogs }, { data: subscription }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("subjects").select("*").order("created_at"),
      supabase.from("notes").select("*").order("created_at"),
      supabase.from("review_logs").select("*").order("reviewed_at"),
      supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
    ]);

  const exportedAt = new Date().toISOString();
  const body = JSON.stringify(
    {
      exported_at: exportedAt,
      account: { id: user.id, email: user.email, profile },
      subscription,
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
