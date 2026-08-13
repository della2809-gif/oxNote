import type { Metadata, Viewport } from "next";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { PwaRegistration } from "@/components/PwaRegistration";
import "./globals.css";

export const metadata: Metadata = {
  title: "xonote — AI 오답노트 & 시험 성장 플랫폼",
  description: "모든 과목의 오답을 모아 AI가 분석해주는 시험 성장 플랫폼",
  applicationName: "xonote",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "xonote" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png?v=3", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png?v=3", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png?v=3",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#1E1B4B",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full w-full min-w-0 flex-col overflow-x-hidden">
        {children}
        <PwaRegistration />
        <PwaInstallPrompt />
      </body>
    </html>
  );
}
