"use client";

import React from "react";
import { Incident } from "@/lib/api";
import { OsWindow } from "../os/OsWindow";
import { OsBadge } from "../os/OsBadge";

interface TriagePanelProps {
  incident: Incident | null;
}

export function TriagePanel({ incident }: TriagePanelProps) {
  if (!incident) {
    return (
      <OsWindow
        title="AI_TRIAGE_HYPOTHESIS"
        version="1.1"
        variant="mulberry"
        headerRight={<span>BEKLEMEDE</span>}
      >
        <div className="py-10 text-center font-mono text-xs space-y-2 text-[#522D60]">
          <div className="font-bold">[OLAY SEÇİLMEDİ]</div>
          <p className="text-[11px] font-sans text-[#80426E] max-w-xs mx-auto">
            İncelemek istediğiniz olayı sol kuyruktan seçin. Gemini AI SRE analiz ve hipotez detayları burada gösterilecektir.
          </p>
        </div>
      </OsWindow>
    );
  }

  const isSev1 = incident.severity === "SEV-1";
  const isSev2 = incident.severity === "SEV-2";

  return (
    <OsWindow
      title="AI_TRIAGE_HYPOTHESIS"
      version="1.1"
      variant="mulberry"
      headerRight={
        <span className="font-bold">
          {incident.incident_code} {" // "} {incident.service?.name || "Servis"}
        </span>
      }
      contentClassName="p-3 space-y-3"
    >
      {/* 1. Triage Decision & Guardrail Matrix (2x2 Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
        {/* Severity Cell */}
        <div className="border-[1.5px] border-[#522D60] p-2 bg-[#FAF6F2] flex flex-col justify-between">
          <span className="text-[9px] font-bold text-[#80426E] uppercase">
            01 // BELİRLENEN SEV
          </span>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-base font-bold text-[#522D60]">
              {incident.severity || "BEKLİYOR"}
            </span>
            {incident.severity && (
              <OsBadge variant={isSev1 ? "sev1" : isSev2 ? "sev2" : "sev3"}>
                {isSev1 ? "KRİTİK" : isSev2 ? "MAJÖR" : "MİNÖR"}
              </OsBadge>
            )}
          </div>
        </div>

        {/* Guardrail Autonomy Mode */}
        <div className="border-[1.5px] border-[#522D60] p-2 bg-[#FAF6F2] flex flex-col justify-between">
          <span className="text-[9px] font-bold text-[#80426E] uppercase">
            02 // OTONOMİ KİLİDİ
          </span>
          <div className="mt-1 font-bold text-[11px] text-[#522D60]">
            {incident.autonomy_mode === "manual_command_only" ? (
              <span className="text-[#D9383A] flex items-center gap-1">
                🔒 TAM KİLİT (MANUEL KOMUT)
              </span>
            ) : incident.autonomy_mode === "approval_required" ? (
              <span className="text-[#522D60] flex items-center gap-1">
                🛡️ ONAY ŞARTI (TEK TIK)
              </span>
            ) : (
              <span className="text-[#1E8E5A] flex items-center gap-1">
                ⚡ TAM OTONOMİ YETKİSİ
              </span>
            )}
          </div>
        </div>

        {/* Escalation Target */}
        <div className="border-[1.5px] border-[#522D60] p-2 bg-[#FAF6F2] flex flex-col justify-between">
          <span className="text-[9px] font-bold text-[#80426E] uppercase">
            03 // AKILLI ESKALASYON
          </span>
          <div className="mt-1 font-bold text-[11px] text-[#522D60]">
            {incident.escalation_target === "on_call_and_team_lead"
              ? "🚨 ON-CALL + TAKIM LİDERİ"
              : incident.escalation_target === "on_call_engineer"
              ? "📟 NÖBETÇİ MÜHENDİS"
              : "🔕 SESSİZ MOD (BİLDİRİM YOK)"}
          </div>
        </div>

        {/* Affected Service Status */}
        <div className="border-[1.5px] border-[#522D60] p-2 bg-[#FAF6F2] flex flex-col justify-between">
          <span className="text-[9px] font-bold text-[#80426E] uppercase">
            04 // SERVİS ETKİSİ
          </span>
          <div className="mt-1 font-bold text-[11px] text-[#522D60] flex items-center justify-between">
            <span>{incident.service?.name}</span>
            <span
              className={`px-1 text-[9px] border border-[#522D60] ${
                incident.service?.status === "outage"
                  ? "bg-[#D9383A] text-[#FFFFFF]"
                  : incident.service?.status === "degraded"
                  ? "bg-[#FFD38B] text-[#522D60]"
                  : "bg-[#1E8E5A] text-[#FFFFFF]"
              }`}
            >
              {incident.service?.status.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Business Impact Reasoning Callout */}
      <div className="border-[1.5px] border-[#522D60] bg-[#FFFFFF] p-2.5 space-y-1">
        <div className="flex items-center justify-between border-b border-[#522D60]/20 pb-1">
          <span className="font-mono text-[10px] font-bold text-[#80426E] uppercase flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-[#FFD38B] border border-[#522D60]" />
            GEMINI AI // İŞ ETKİSİ ANALİZİ VE SEV GEREKÇESİ
          </span>
          <span className="font-mono text-[9px] text-[#80426E]">
            Model: gemini-2.5-flash
          </span>
        </div>
        <p className="font-sans text-[12px] text-[#522D60] leading-relaxed pt-1">
          {incident.reasoning || "Ajan analiz süreci devam ediyor..."}
        </p>
      </div>

      {/* 3. Root Cause Hypothesis */}
      <div className="border-[1.5px] border-[#522D60] bg-[#FAF6F2] p-2.5 space-y-1">
        <div className="flex items-center justify-between border-b border-[#522D60]/20 pb-1">
          <span className="font-mono text-[10px] font-bold text-[#522D60] uppercase flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-[#522D60]" />
            KÖK NEDEN HİPOTEZİ (ROOT CAUSE)
          </span>
        </div>
        <p className="font-sans text-[12px] font-medium text-[#522D60] leading-relaxed pt-1">
          {incident.hypothesis || "Kök neden tespiti yapılıyor..."}
        </p>
      </div>
    </OsWindow>
  );
}
