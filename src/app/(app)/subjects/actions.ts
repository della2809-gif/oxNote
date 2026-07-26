"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const SUBJECT_COLORS = [
  "#6366f1", "#ec4899", "#22c55e", "#f59e0b", "#06b6d4", "#a855f7", "#ef4444",
];

export async function createSubject(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const color = SUBJECT_COLORS[Math.floor(Math.random() * SUBJECT_COLORS.length)];

  await supabase.from("subjects").insert({ user_id: user.id, name, color });
  revalidatePath("/subjects");
  revalidatePath("/notes");
}

export async function deleteSubject(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("subjects").delete().eq("id", id);
  revalidatePath("/subjects");
  revalidatePath("/notes");
}
