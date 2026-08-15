export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 dark:bg-neutral-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="text-2xl font-bold tracking-tight">xonote</span>
          <p className="mt-1 text-sm text-neutral-500">AI 오답노트 &amp; 시험 성장 플랫폼</p>
        </div>
        {children}
      </div>
    </div>
  );
}
