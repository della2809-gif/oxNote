"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Subject } from "@/lib/types";
import { nextSubjectColor } from "@/lib/subject-color-palette";

export async function createSubject(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 40) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const color = await nextSubjectColor(supabase, user.id);

  await supabase.from("subjects").insert({ user_id: user.id, name, color });
  revalidatePath("/subjects");
  revalidatePath("/notes");
  revalidatePath("/notes/new");
}

export async function createSubjectInline(
  rawName: string,
): Promise<{ subject: Subject | null; error: string | null }> {
  const name = rawName.trim().replace(/\s+/g, " ");
  if (!name) return { subject: null, error: "과목명을 입력해 주세요." };
  if (name.length > 40) return { subject: null, error: "과목명은 40자 이하로 입력해 주세요." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { subject: null, error: "로그인이 필요합니다." };

  const { data: existing } = await supabase
    .from("subjects")
    .select("id, user_id, name, color, created_at")
    .eq("user_id", user.id)
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  if (existing) return { subject: existing as Subject, error: null };

  const { data, error } = await supabase
    .from("subjects")
    .insert({ user_id: user.id, name, color: await nextSubjectColor(supabase, user.id) })
    .select("id, user_id, name, color, created_at")
    .single();

  if (error || !data) {
    return { subject: null, error: "과목을 추가하지 못했습니다. 다시 시도해 주세요." };
  }

  revalidatePath("/subjects");
  revalidatePath("/notes");
  revalidatePath("/notes/new");
  return { subject: data as Subject, error: null };
}

export async function deleteSubject(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("subjects").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/subjects");
  revalidatePath("/notes");
}
