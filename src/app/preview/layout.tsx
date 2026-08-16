export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* 로그인 없는 개발 미리보기에서는 전역 인트로가 내용을 가리지 않게 한다. */}
      <style>{`.xo-splash { display: none !important; }`}</style>
      {children}
    </>
  );
}
