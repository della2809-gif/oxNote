import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/notes/[id]/source">,
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data: note, error } = await supabase
    .from("notes")
    .select("source_file_url")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !note?.source_file_url) {
    return Response.json({ error: "원본 파일을 찾을 수 없습니다." }, { status: 404 });
  }

  const { data, error: signedUrlError } = await supabase.storage
    .from("note-files")
    .createSignedUrl(note.source_file_url, 300);

  if (signedUrlError || !data?.signedUrl) {
    return Response.json({ error: "원본 파일을 불러오지 못했습니다." }, { status: 502 });
  }

  return Response.json(
    {
      url: data.signedUrl,
      type: note.source_file_url.toLowerCase().endsWith(".pdf") ? "pdf" : "image",
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
