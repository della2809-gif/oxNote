import { createClient } from "@/lib/supabase/server";
import type { Subject } from "@/lib/types";
import NoteForm from "./NoteForm";

export default async function NewNotePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: subjects } = await supabase.from("subjects").select("*").order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">오답 추가</h1>
        <p className="mt-1 text-sm text-neutral-500">
          직접 입력하거나, 문제 사진/PDF를 업로드하면 AI가 자동으로 원인을 분석해 드립니다.
        </p>
      </div>

      <NoteForm subjects={(subjects as Subject[] | null) ?? []} error={error} />
    </div>
  );
}
