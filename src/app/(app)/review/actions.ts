"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createReviewGoal(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  const subjectId = String(formData.get("subjectId") ?? "") || null;
  const topics = Array.from(
    new Set(
      formData
        .getAll("topics")
        .map((topic) => String(topic).trim())
        .filter(Boolean),
    ),
  ).slice(0, 30);

  if (
    !name
    || name.length > 80
    || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)
    || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
    || endDate < startDate
  ) {
    redirect(`/review?error=${encodeURIComponent("목표명과 학습 기간을 다시 확인해 주세요.")}`);
  }

  if (subjectId) {
    const { data: subject } = await supabase
      .from("subjects")
      .select("id")
      .eq("id", subjectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!subject) {
      redirect(`/review?error=${encodeURIComponent("선택한 과목을 확인할 수 없습니다.")}`);
    }
  }

  const { data, error } = await supabase
    .from("review_goals")
    .insert({
      user_id: user.id,
      subject_id: subjectId,
      name,
      start_date: startDate,
      end_date: endDate,
      topics,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(`/review?error=${encodeURIComponent("복습 목표를 저장하지 못했습니다.")}`);
  }

  revalidatePath("/review");
  redirect(`/review?goal=${data.id}&success=${encodeURIComponent("시험 복습 목표를 만들었습니다.")}`);
}

export async function deleteReviewGoal(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const goalId = String(formData.get("goalId") ?? "");
  await supabase
    .from("review_goals")
    .delete()
    .eq("id", goalId)
    .eq("user_id", user.id);

  revalidatePath("/review");
  redirect(`/review?success=${encodeURIComponent("복습 목표를 삭제했습니다.")}`);
}
