"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requestAccountDeletion(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (confirmation !== "계정 삭제 요청") {
    redirect("/settings?error=" + encodeURIComponent("확인 문구를 정확히 입력해 주세요."));
  }

  const { error } = await supabase.from("account_deletion_requests").insert({
    user_id: user.id,
    reason: reason || null,
  });

  if (error) {
    redirect(
      "/settings?error=" +
        encodeURIComponent(
          error.code === "23505" ? "이미 처리 중인 계정 삭제 요청이 있습니다." : error.message,
        ),
    );
  }

  revalidatePath("/settings");
  redirect("/settings?success=" + encodeURIComponent("계정 삭제 요청을 접수했습니다."));
}
