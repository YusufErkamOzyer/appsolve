"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { OsClock } from "./OsClock";
import { OsButton } from "./OsButton";
import { resetSystem } from "@/lib/api";

interface OsNavbarProps {
  onResetComplete?: () => void;
  onOpenSimulator?: () => void;
  activeSev1?: boolean;
}

export function OsNavbar({ onResetComplete, onOpenSimulator, activeSev1 = false }: OsNavbarProps) {
  const pathname = usePathname();
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    if (!confirm("Sistem verileri sıfırlanacak ve tüm servisler 'ÇALIŞIYOR' durumuna getirilecek. Onaylıyor musunuz?")) {
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

  return (
    <header className="border-b-[1.5px] border-[#522D60] bg-[#FFFFFF] sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-3 py-2 flex flex-wrap items-center justify-between gap-3">
        {/* Brand & System Code */}
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-[1.5px] border-[#522D60] bg-[#522D60] text-[#FFFFFF] flex items-center justify-center font-mono font-bold text-xs select-none">
            ≡
          </div>
          <div>
            <div className="font-mono font-bold text-[13px] tracking-wider text-[#522D60] flex items-center gap-2">
              <span>APPSOLVE.OS1</span>
              <span className="text-[10px] px-1.5 py-0.2 bg-[#FAF6F2] border border-[#522D60] font-normal">
                SRE COMMAND WORKSTATION
              </span>
            </div>
            <div className="text-[10px] text-[#80426E] font-mono">
              QuickCart Autonomous Incident Triage & Telemetry
            </div>
          </div>
        </div>

        {/* Surface Navigation Switcher */}
        <nav className="flex items-center gap-1.5 font-mono text-[11px]">
          <Link
            href="/"
            className={`px-3 py-1 border-[1.5px] border-[#522D60] uppercase tracking-wider transition-none ${
              pathname === "/"
                ? "bg-[#522D60] text-[#FFFFFF] font-bold os-btn-shadow"
                : "bg-[#FFFFFF] text-[#522D60] hover:bg-[#FAF6F2]"
            }`}
          >
            [□] KOMUTA MERKEZİ (/)
          </Link>
          <Link
            href="/status"
            className={`px-3 py-1 border-[1.5px] border-[#522D60] uppercase tracking-wider transition-none ${
              pathname === "/status"
                ? "bg-[#522D60] text-[#FFFFFF] font-bold os-btn-shadow"
                : "bg-[#FFFFFF] text-[#522D60] hover:bg-[#FAF6F2]"
            }`}
          >
            [●] STATUS PAGE (/status)
          </Link>
        </nav>

        {/* Telemetry Indicator & Tools */}
        <div className="flex items-center gap-2">
          {onOpenSimulator && (
            <OsButton
              variant="apricot"
              size="sm"
              onClick={onOpenSimulator}
              title="Test telemetri sinyali gönder"
            >
              ⚡ SİNYAL SİMÜLATÖRÜ
            </OsButton>
          )}

          <div className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 border border-[#522D60] bg-[#FAF6F2] font-mono text-[10px] text-[#522D60]">
            <span className={`w-1.5 h-1.5 ${activeSev1 ? "bg-[#D9383A] animate-ping" : "bg-[#1E8E5A] animate-pulse"}`} />
            <span>{activeSev1 ? "SEV-1 ALARM" : "API ONLINE"}</span>
          </div>

          <OsClock />

          <OsButton
            variant="paper"
            size="sm"
            onClick={handleReset}
            disabled={resetting}
            title="Tüm olayları temizler ve servisleri normale döndürür"
          >
            {resetting ? "..." : "↺ SIFIRLA"}
          </OsButton>
        </div>
      </div>
    </header>
  );
}
