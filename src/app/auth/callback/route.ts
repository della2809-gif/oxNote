import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { acceptFamilyInvitationForUser } from "@/lib/family-invitations";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next");
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const familyInviteMatch = next.match(/^\/guardian\/invite\/([A-Za-z0-9_-]+)\/auto$/);
      if (familyInviteMatch) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          return NextResponse.redirect(
            new URL(
              `/login?error=${encodeURIComponent("초대 인증 세션을 확인하지 못했습니다.")}`,
              url.origin,
            ),
          );
        }
        const result = await acceptFamilyInvitationForUser({
          token: familyInviteMatch[1],
          userId: user.id,
          userEmail: user.email,
        });
        if (result.ok) {
          return NextResponse.redirect(
            new URL(
              `/settings?success=${encodeURIComponent("이메일 인증과 자녀 연결이 완료되었습니다.")}`,
              url.origin,
            ),
          );
        }
        return NextResponse.redirect(
          new URL(
            `/guardian/invite/${familyInviteMatch[1]}?error=${encodeURIComponent(result.error)}`,
            url.origin,
          ),
        );
      }
      return NextResponse.redirect(new URL(next, url.origin));
    }

    if (next === "/update-password") {
      return NextResponse.redirect(
        new URL(
          `/update-password?error=${encodeURIComponent("재설정 링크가 만료되었거나 이미 사용되었습니다. 새 메일을 요청해 주세요.")}`,
          url.origin,
        ),
      );
    }
  }

  if (next === "/update-password") {
    // Implicit-flow recovery tokens are carried in the URL fragment. Browsers
    // preserve that fragment across this redirect so the client page can
    // establish the recovery session without exposing tokens to the server.
    return NextResponse.redirect(new URL(next, url.origin));
  }

  return NextResponse.redirect(
    new URL(
      `/login?error=${encodeURIComponent("인증 링크가 만료되었거나 올바르지 않습니다. 다시 요청해 주세요.")}`,
      url.origin,
    ),
  );
}
