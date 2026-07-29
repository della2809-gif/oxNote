import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "xonote — AI 오답노트 & 시험 성장 플랫폼",
  description: "모든 과목의 오답을 모아 AI가 분석해주는 시험 성장 플랫폼",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full w-full min-w-0 flex-col overflow-x-hidden">{children}</body>
    </html>
  );
}
