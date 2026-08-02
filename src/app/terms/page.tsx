import Link from "next/link";

export const metadata = { title: "이용약관 | xonote" };

export default function TermsPage() {
  return (
    <LegalDocument title="xonote 이용약관" effectiveDate="2026년 7월 28일">
      <Section title="1. 목적과 적용">
        본 약관은 xonote가 제공하는 AI 오답 분석, 복습 관리, 파일 보관 및 유료 구독 서비스의 이용
        조건을 정합니다. 실제 유료 서비스 출시 전 사업자 정보, 고객센터 연락처와 결제대행사 정보를
        확정하여 본 문서를 최종 검토해야 합니다.
      </Section>
      <Section title="2. 계정">
        이용자는 정확한 정보를 제공하고 계정 접근 정보를 안전하게 관리해야 합니다. 비정상적인 자동
        호출, 타인의 계정 사용 또는 서비스 운영을 방해하는 행위는 제한될 수 있습니다.
      </Section>
      <Section title="3. AI 분석">
        AI 분석은 학습 보조 정보이며 정답이나 성적 향상을 보장하지 않습니다. 이용자는 중요한 결과를
        교재, 교사 또는 공식 해설과 함께 확인해야 합니다.
      </Section>
      <Section title="4. 요금제와 사용량">
        유료 요금제에는 월별 AI 분석 횟수와 파일 저장 한도가 포함될 수 있습니다. 구체적인 가격과
        한도는 결제 화면에 표시하며, 실패한 AI 분석은 원칙적으로 사용량에서 제외합니다.
      </Section>
      <Section title="5. 결제, 해지와 환불">
        정기결제일, 다음 결제 예정 금액, 해지 효력 발생 시점과 환불 기준은 결제 전에 표시합니다.
        디지털 콘텐츠의 사용이 시작된 경우 관련 법령에 따라 청약철회가 제한될 수 있으며, 제한되는
        경우 체험 또는 서비스 정보를 사전에 제공합니다.
      </Section>
      <Section title="6. 이용자 콘텐츠">
        이용자는 업로드하는 문제와 파일을 사용할 권한이 있어야 하며, 개인정보나 제3자의 권리를
        침해하는 자료를 올려서는 안 됩니다. 서비스 제공과 분석을 위해 필요한 범위에서만 콘텐츠를
        처리합니다.
      </Section>
      <Section title="7. 서비스 변경과 중단">
        점검, 보안, 외부 AI·클라우드 사업자의 장애 등으로 서비스가 일시 중단될 수 있습니다. 중요한
        변경은 합리적인 방법으로 사전 고지합니다.
      </Section>
      <Section id="support" title="8. 문의">
        고객지원 이메일과 사업자 정보는 유료 서비스 출시 전에 본 조항에 추가합니다.
      </Section>
    </LegalDocument>
  );
}

function LegalDocument({
  title,
  effectiveDate,
  children,
}: {
  title: string;
  effectiveDate: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12">
      <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">← xonote</Link>
      <h1 className="mt-6 text-3xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-neutral-500">시행일: {effectiveDate}</p>
      <div className="mt-10 space-y-8">{children}</div>
    </main>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 whitespace-pre-line leading-7 text-neutral-600 dark:text-neutral-400">{children}</p>
    </section>
  );
}
