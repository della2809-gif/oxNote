import Link from "next/link";

export const metadata = { title: "개인정보 처리방침 | xonote" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12">
      <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">← xonote</Link>
      <h1 className="mt-6 text-3xl font-bold">개인정보 처리방침</h1>
      <p className="mt-2 text-sm text-neutral-500">시행일: 2026년 7월 28일</p>
      <p className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
        이 문서는 개발 단계 초안입니다. 유료 출시 전 사업자 정보, 개인정보 보호책임자, 국외 이전
        항목과 실제 보유기간을 확정해 법률 검토해야 합니다.
      </p>

      <div className="mt-10 space-y-8">
        <Section title="1. 처리하는 개인정보">
          계정 정보(이메일, 표시 이름), 서비스 이용 기록, 과목과 오답노트, 복습 기록, 업로드한 문제
          이미지·PDF, AI 분석 요청 및 사용량, 구독·결제 상태를 처리할 수 있습니다. 카드번호 등 결제
          수단 정보는 결제대행사가 직접 처리하며 xonote는 저장하지 않는 구조를 원칙으로 합니다.
        </Section>
        <Section title="2. 이용 목적">
          회원 인증, 오답 분석과 복습 서비스 제공, 요금제 한도 적용, 결제·환불 지원, 보안과 부정 이용
          방지, 서비스 품질 개선을 위해 처리합니다.
        </Section>
        <Section title="3. 외부 처리 사업자">
          데이터베이스·인증·파일 저장에는 Supabase, 서비스 배포에는 Vercel, AI 분석에는 OpenAI,
          결제에는 추후 선정할 결제대행사를 사용할 수 있습니다. 유료 출시 전 각 사업자의 처리 국가,
          이전 항목, 목적과 보유기간을 본 방침에 구체적으로 공개합니다.
        </Section>
        <Section title="4. 보유와 삭제">
          회원 탈퇴 또는 처리 목적 달성 시 데이터를 지체 없이 삭제하는 것을 원칙으로 합니다. 다만
          결제·분쟁 대응 등 법령상 보존 의무가 있는 정보는 해당 기간 동안 분리 보관할 수 있습니다.
          사용자는 계정 설정에서 데이터 다운로드와 삭제 요청을 할 수 있습니다.
        </Section>
        <Section title="5. 업로드 파일">
          문제 파일은 비공개 저장소에 보관하며 만료되는 접근 주소를 사용합니다. 이용자는 이름, 학교,
          학번 등 분석에 불필요한 개인정보를 가린 뒤 업로드하는 것이 좋습니다.
        </Section>
        <Section title="6. 이용자의 권리">
          이용자는 자신의 개인정보 열람, 정정, 삭제, 처리정지와 동의 철회를 요청할 수 있습니다.
          계정 설정 또는 고객지원 채널을 통해 요청을 접수합니다.
        </Section>
        <Section title="7. 아동의 개인정보">
          만 14세 미만 이용자를 받는 경우 법정대리인 동의 절차와 확인 방법을 별도로 마련한 뒤
          서비스를 제공합니다.
        </Section>
        <Section title="8. 안전성 확보">
          행 단위 접근제어(RLS), 비공개 파일 저장, 서버 전용 비밀키, 관리자 권한 분리, 요청 제한과
          인증 감사 로그를 이용해 데이터를 보호합니다.
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 whitespace-pre-line leading-7 text-neutral-600 dark:text-neutral-400">{children}</p>
    </section>
  );
}
