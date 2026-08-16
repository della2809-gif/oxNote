"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.app_metadata?.role !== "admin") redirect("/dashboard");
  return { user, admin: createAdminClient() };
}

export async function saveAiEvaluation(formData: FormData) {
  const { user, admin } = await requireAdmin();
  const mode = String(formData.get("analysisMode") ?? "");
  const number = Number(formData.get("problemNumber"));
  const recognition = String(formData.get("recognitionStatus") ?? "");
  const answer = String(formData.get("answerStatus") ?? "");
  const solution = String(formData.get("solutionStatus") ?? "");
  const notation = String(formData.get("notationStatus") ?? "");
  const severity = String(formData.get("severity") ?? "");
  if (!["a", "b"].includes(mode) || !Number.isInteger(number) || number < 1 || number > 46 ||
      !["passed", "failed", "unscorable"].includes(recognition) || !["passed", "failed", "unscorable"].includes(answer) ||
      !["passed", "partial", "failed", "unscorable"].includes(solution) || !["passed", "failed", "unscorable"].includes(notation) ||
      !["normal", "minor", "major", "critical", "unscorable"].includes(severity)) {
    redirect("/admin/ai-evaluation?error=" + encodeURIComponent("평가 입력값을 확인해 주세요."));
  }
  const seconds = Number(formData.get("processingSeconds"));
  const cost = Number(formData.get("estimatedCostUsd"));
  const noteId = String(formData.get("noteId") ?? "").trim();
  const { error } = await admin.from("ai_evaluation_results").upsert({
    evaluator_user_id: user.id, note_id: noteId || null, test_batch: "math-46",
    problem_number: number, analysis_mode: mode, recognition_status: recognition,
    answer_status: answer, solution_status: solution, notation_status: notation, severity,
    processing_ms: Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : null,
    estimated_cost_usd: Number.isFinite(cost) && cost >= 0 ? cost : null,
    retry_required: formData.get("retryRequired") === "on", save_blocked: formData.get("saveBlocked") === "on",
    notes: String(formData.get("notes") ?? "").trim().slice(0, 2000) || null,
  }, { onConflict: "test_batch,problem_number,analysis_mode" });
  if (error) redirect("/admin/ai-evaluation?error=" + encodeURIComponent(error.message));
  revalidatePath("/admin/ai-evaluation");
  redirect(`/admin/ai-evaluation?success=${number}번 ${mode.toUpperCase()}안 저장 완료`);
}
