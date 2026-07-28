import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "xonote — AI 오답노트 & 시험 성장 플랫폼",
  description: "모든 과목의 오답을 모아 AI가 분석해주는 시험 성장 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
