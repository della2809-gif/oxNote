import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "xonote — AI 오답노트",
    short_name: "xonote",
    description: "모든 과목의 오답을 모아 AI가 분석해 주는 시험 성장 플랫폼",
    start_url: "/dashboard?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#1E1B4B",
    orientation: "any",
    categories: ["education", "productivity"],
    lang: "ko-KR",
    icons: [
      { src: "/icons/icon-192.png?v=3", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png?v=3", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png?v=3", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "새 문제 분석", short_name: "문제 분석", description: "새 오답 문제를 등록하고 AI로 분석합니다.", url: "/notes/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "오답노트", short_name: "오답노트", description: "저장한 오답을 확인합니다.", url: "/notes", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "복습하기", short_name: "복습", description: "오늘의 복습 문제를 확인합니다.", url: "/review", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
