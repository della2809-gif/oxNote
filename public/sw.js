const CACHE_NAME = "xonote-static-v4";
const OFFLINE_URL = "/offline";
const PRECACHE_URLS = [OFFLINE_URL, "/icons/icon-32.png", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // 회원별 오답 이미지나 API 결과가 기기 캐시에 남지 않도록 빌드 파일과 앱 아이콘만 저장합니다.
  const isStaticAsset = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
  if (!isStaticAsset) return;

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (!response.ok || response.type !== "basic") return response;
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    return response;
  })));
});
