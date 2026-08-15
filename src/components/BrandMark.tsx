export function BrandSymbol({ className = "h-12 w-24" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 64" aria-label="XO" role="img" className={className}>
      <g stroke="#0B153D" strokeWidth="11" strokeLinecap="round">
        <path d="M20 17L51 48M51 17L20 48" />
      </g>
      <circle cx="87" cy="32" r="20" fill="none" stroke="#3169EF" strokeWidth="11" />
    </svg>
  );
}

export function BrandWordmark({ className = "h-16 w-56" }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 92" aria-label="xonote" role="img" className={className}>
      <g stroke="#0B153D" strokeWidth="15" strokeLinecap="round">
        <path d="M20 27L61 68M61 27L20 68" />
      </g>
      <circle cx="99" cy="48" r="22" fill="none" stroke="#3169EF" strokeWidth="15" />
      <text x="129" y="69" fill="#0B153D" fontFamily="Pretendard, Noto Sans KR, sans-serif" fontSize="62" fontWeight="900" letterSpacing="-4">note</text>
    </svg>
  );
}
