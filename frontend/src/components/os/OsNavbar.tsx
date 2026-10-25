"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { OsClock } from "./OsClock";
import { resetSystem, fetchAiStatus, toggleAiStatus, Service } from "@/lib/api";

interface OsNavbarProps {
  onResetComplete?: () => void;
  onOpenSimulator?: () => void;
  activeSev1?: boolean;
  sev1SlaDeadline?: string | null;
  services?: Service[];
}

export function OsNavbar({
  onResetComplete,
  onOpenSimulator,
  activeSev1 = false,
  services = [],
}: OsNavbarProps) {
  const pathname = usePathname();
  const [resetting, setResetting] = useState(false);
  const [showServiceFlyout, setShowServiceFlyout] = useState(false);
  const [aiConnected, setAiConnected] = useState<boolean>(true);
  const [togglingAi, setTogglingAi] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    const checkAi = async () => {
      try {
        const res = await fetchAiStatus();
        if (isMounted) {
          setAiConnected(res.ai_connected);
        }
      } catch {
        // Silently poll
      }
    };

    void checkAi();
    const interval = setInterval(checkAi, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleToggleAi = async (desiredState?: boolean) => {
    setTogglingAi(true);
    try {
      const nextState = desiredState !== undefined ? desiredState : !aiConnected;
      setAiConnected(nextState);
      const res = await toggleAiStatus(nextState);
      setAiConnected(res.ai_connected);
    } catch (err) {
      alert("AI bağlantı durumu değiştirilemedi: " + err);
    } finally {
      setTogglingAi(false);
    }
  };

  const handleReset = async () => {
    if (
      !confirm(
        "Sistem verileri sıfırlanacak ve tüm servisler 'ÇALIŞIYOR' durumuna getirilecek. Onaylıyor musunuz?"
      )
    ) {
      return;
    }
    setResetting(true);
    try {
      await resetSystem();
      if (onResetComplete) onResetComplete();
      window.location.reload();
    } catch (err) {
      alert("Sıfırlama başarısız: " + err);
    } finally {
      setResetting(false);
    }
  };

  const operationalServicesCount = services.filter((s) => s.status === "operational").length;
  const totalServicesCount = services.length || 4;

  return (
    <header className="border-b-[1.5px] border-[#522D60] bg-[#522D60] text-[#FFFFFF] sticky top-0 z-50 select-none shadow-xs">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Brand & Surface Links */}
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border border-white/40 bg-white/10 flex items-center justify-center overflow-hidden select-none p-0.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/appsolve-icon.png" alt="Appsolve Owl" className="w-full h-full object-contain" />
          </div>

          <div className="flex items-center gap-2 font-mono">
            <span className="font-bold text-[13px] tracking-wider text-[#FFFFFF]">
              APPSOLVE.OS1
            </span>
            <span className="text-white/40">|</span>
            <nav className="flex items-center gap-2 text-[11px]">
              <Link
                href="/"
                className={`transition-none hover:text-[#FFD38B] ${
                  pathname === "/"
                    ? "text-[#FFFFFF] font-bold underline underline-offset-4 decoration-[#F2A67B]"
                    : "text-white/70"
                }`}
              >
                Olay Yönetimi
              </Link>
              <span className="text-white/30">·</span>
              <Link
                href="/status"
                className={`transition-none hover:text-[#FFD38B] ${
                  pathname === "/status"
                    ? "text-[#FFFFFF] font-bold underline underline-offset-4 decoration-[#F2A67B]"
                    : "text-white/70"
                }`}
              >
                Durum Sayfası
              </Link>
            </nav>
          </div>
        </div>

        {/* Right: Telemetry, Clock, Reset & Simulator */}
        <div className="flex items-center gap-2.5 font-mono text-[11px]">
          {/* Active SEV-1 Alert or System Online Pill */}
          {activeSev1 ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#D9383A] text-[#FFFFFF] border border-white/60 font-bold animate-pulse text-[10px]">
              <span className="w-2 h-2 bg-[#FFFFFF]" />
              <span>! SEV-1 KRİTİK ALARM AKTİF</span>
            </div>
          ) : (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowServiceFlyout(!showServiceFlyout)}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-white/10 hover:bg-white/15 border border-white/20 text-[#FFFFFF] text-[10px] cursor-pointer"
                title="QuickCart 4 temel servisin anlık durumu"
              >
                <span className="w-1.5 h-1.5 bg-[#1E8E5A]" />
                <span>
                  Sistem Çevrimiçi ({operationalServicesCount}/{totalServicesCount})
                </span>
              </button>

              {/* Service Health Popover on Click */}
              {showServiceFlyout && (
                <div className="absolute right-0 top-full mt-1.5 w-64 bg-[#FFFFFF] text-[#522D60] border-[1.5px] border-[#522D60] p-2 os-window-shadow z-50 text-[10px] space-y-1">
                  <div className="font-bold border-b border-[#522D60]/20 pb-1 text-[#80426E]">
                    QUICKCART SERVİS TELEMETRİSİ
                  </div>
                  {services.map((s) => (
                    <div key={s.slug} className="flex items-center justify-between py-0.5">
                      <span className="font-semibold">{s.name}:</span>
                      <span
                        className={`px-1 py-0.2 border border-[#522D60] font-bold ${
                          s.status === "operational"
                            ? "bg-[#1E8E5A] text-[#FFFFFF]"
                            : s.status === "degraded"
                            ? "bg-[#FFD38B] text-[#522D60]"
                            : "bg-[#D9383A] text-[#FFFFFF]"
                        }`}
                      >
                        {s.status_label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <span className="text-white/30 hidden sm:inline">|</span>

          {/* Clock */}
          <div className="text-white/90">
            <OsClock className="bg-white/10 text-[#FFFFFF] border-white/30" />
          </div>

          <span className="text-white/30 hidden sm:inline">|</span>

          {/* AI Ajanları Bağlantı ve Token Tasarrufu Kontrolcüsü */}
          <div
            className="flex items-center gap-1.5 border border-white/20 bg-white/5 px-2 py-0.5 text-[11px] font-mono select-none"
            test-id="ai-automation-controller"
          >
            {aiConnected ? (
              <div className="flex items-center gap-2">
                <span
                  className="flex items-center gap-1.5 text-[#4ADE80] font-bold text-[10px]"
                  title="AI ajanları (TypeSafe Jev & Gemini Antigravity) aktif ve bağlı"
                >
                  <span className="w-2 h-2 rounded-full bg-[#4ADE80] animate-pulse" />
                  <span className="hidden sm:inline">AI:</span>
                  <span>BAĞLI</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleToggleAi(false)}
                  disabled={togglingAi}
                  className="px-2 py-0.5 bg-[#D9383A] hover:bg-[#b82b2d] active:bg-[#992224] text-white border border-white/40 text-[10px] font-bold cursor-pointer transition-none select-none"
                  title="Mobil hata testlerinde gereksiz token tüketimini önlemek için AI bağlantısını kes"
                  test-id="btn-disconnect-ai"
                >
                  {togglingAi ? "..." : "BAĞLANTIYI KES"}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span
                  className="flex items-center gap-1.5 text-[#FBBF24] font-bold text-[10px]"
                  title="AI bağlantısı kesik: Hata sinyalleri yapay zeka token'ı harcamadan kaydedilir"
                >
                  <span className="w-2 h-2 rounded-full bg-[#FBBF24]" />
                  <span className="hidden sm:inline">AI:</span>
                  <span>KESİK (TASARRUF)</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleToggleAi(true)}
                  disabled={togglingAi}
                  className="px-2 py-0.5 bg-[#1E8E5A] hover:bg-[#167046] active:bg-[#0f4d30] text-white border border-white/40 text-[10px] font-bold cursor-pointer transition-none select-none"
                  title="AI ajanlarını bağla ve otomatik triyajı aktif et"
                  test-id="btn-connect-ai"
                >
                  {togglingAi ? "..." : "BAĞLAN"}
                </button>
              </div>
            )}
          </div>

          <span className="text-white/30 hidden sm:inline">|</span>

          {/* Reset Button */}
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting}
            title="Sistemi sıfırla"
            className="w-7 h-7 flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/30 text-white cursor-pointer transition-none select-none text-xs"
          >
            {resetting ? "..." : "↺"}
          </button>

          {/* Signal Simulator Trigger Button */}
          {onOpenSimulator && (
            <button
              type="button"
              onClick={onOpenSimulator}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 hover:bg-white/20 border border-white/50 text-[#FFFFFF] font-mono text-[11px] font-bold cursor-pointer transition-none select-none"
            >
              <span>((p))</span>
              <span>SİNYAL SİMÜLATÖRÜ</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
