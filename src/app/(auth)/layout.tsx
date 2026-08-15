import { BrandSymbol, BrandWordmark } from "@/components/BrandMark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f7ff] px-4 py-10 text-[#0b153d]">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandSymbol className="h-9 w-20" />
          <BrandWordmark className="mt-3 h-12 w-44" />
          <p className="mt-3 text-sm font-medium text-[#8795c2]">틀려도 괜찮아. 다시 알면 되니까.</p>
        </div>
        {children}
      </div>
    </div>
  );
}
