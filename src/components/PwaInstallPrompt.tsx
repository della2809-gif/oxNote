"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isStandalone() {
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || standaloneNavigator.standalone === true;
}

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || window.localStorage.getItem("xonote-install-prompt-dismissed") === "true") return;
    const iosPromptTimer = /iphone|ipad|ipod/i.test(navigator.userAgent)
      ? window.setTimeout(() => setVisible(true), 0)
      : null;

    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const installed = () => {
      setVisible(false);
      setInstallEvent(null);
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installed);
    return () => {
      if (iosPromptTimer !== null) window.clearTimeout(iosPromptTimer);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  const dismiss = () => {
    window.localStorage.setItem("xonote-install-prompt-dismissed", "true");
    setVisible(false);
  };

  const install = async () => {
    if (!installEvent) {
      setShowIosHelp(true);
      return;
    }
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setVisible(false);
    setInstallEvent(null);
  };

  if (!visible) return null;

  return (
    <aside aria-label="xonote 앱 설치" className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-[100] mx-auto max-w-md rounded-2xl border border-indigo-100 bg-white p-4 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="h-12 w-12 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-neutral-950 dark:text-white">xonote 앱으로 더 편하게</p>
          <p className="mt-1 text-sm leading-5 text-neutral-600 dark:text-neutral-300">홈 화면에 설치하면 핸드폰·패드·PC에서 앱처럼 바로 열 수 있어요.</p>
        </div>
        <button type="button" onClick={dismiss} aria-label="설치 안내 닫기" className="min-h-11 min-w-11 rounded-full text-xl text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">×</button>
      </div>
      {showIosHelp ? <div className="mt-3 rounded-xl bg-indigo-50 p-3 text-sm leading-6 text-indigo-950 dark:bg-indigo-950 dark:text-indigo-100">Safari 하단의 <strong>공유</strong> 버튼을 누른 뒤 <strong>홈 화면에 추가</strong>를 선택해 주세요.</div> : null}
      <button type="button" onClick={install} className="mt-3 min-h-12 w-full rounded-xl bg-indigo-600 px-4 font-semibold text-white hover:bg-indigo-500">{installEvent ? "앱 설치" : "iPhone·iPad 설치 방법"}</button>
    </aside>
  );
}
