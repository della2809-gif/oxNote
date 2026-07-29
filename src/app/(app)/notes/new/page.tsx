import { createClient } from "@/lib/supabase/server";
import type { Subject } from "@/lib/types";
import NoteForm from "./NoteForm";

export const maxDuration = 300;

export default async function NewNotePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: subjects } = await supabase.from("subjects").select("*").order("name");

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <div>
        <p className="text-sm font-bold text-indigo-600">문제 파일 분석</p>
        <h1 className="mt-3 max-w-4xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          문제를 찍거나 PDF로 올리면{" "}
          <span className="text-indigo-600">유형부터 풀이까지</span> 보여줘요.
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-500 sm:text-base">
          사진과 PDF에서 문제 유형과 예상 혼동 지점을 분석하고, 학생 풀이가 있으면 실제 오류 지점까지 찾아냅니다.
        </p>
      </div>

      <NoteForm subjects={(subjects as Subject[] | null) ?? []} error={error} />
    </div>
  );
}
