"use client";

import React from "react";
import { Incident } from "@/lib/api";
import { OsWindow } from "../os/OsWindow";
import { OsBadge } from "../os/OsBadge";

interface WarRoomShellProps {
  incident: Incident | null;
  onOpenSimulator?: () => void;
}

export function WarRoomShell({ incident, onOpenSimulator }: WarRoomShellProps) {
  if (!incident) {
    return (
      <OsWindow
        title="WAR_ROOM"
        version="1.1"
        variant="ink"
        headerRight={<span>STANDBY // BEKLEMEDE</span>}
      >
        <div className="py-20 text-center font-mono text-xs space-y-3 text-[#522D60]">
          <div className="font-bold text-sm">[SAVAŞ ODASI BEKLEMEDE]</div>
          <p className="text-[12px] font-sans text-[#80426E] max-w-sm mx-auto">
            Aktif bir kriz veya inceleme için sol kuyruktan bir olay seçin ya da QuickCart simülatöründen sinyal gönderin.
          </p>
          {onOpenSimulator && (
            <button
              type="button"
              onClick={onOpenSimulator}
              className="px-3.5 py-1.5 bg-[#F2A67B] text-[#522D60] border-[1.5px] border-[#522D60] font-mono text-xs font-bold os-btn-shadow cursor-pointer"
            >
              ⚡ SİNYAL GÖNDER VE ODAYI AÇ
            </button>
          )}
        </div>
      </OsWindow>
    );
  }

  const isSev1 = incident.severity === "SEV-1";
  const isSev2 = incident.severity === "SEV-2";
  const plan = incident.recommended_action_plan;
  const rawPayload = incident.raw_payload || {};
  const metrics = (rawPayload.metrics as Record<string, unknown>) || {};

  return (
    <OsWindow
      title="WAR_ROOM"
      version="1.1"
      variant={isSev1 ? "crimson" : "ink"}
      headerRight={
        <span>
          {isSev1
            ? "KRİTİK İŞBİRLİĞİ // MANUEL KOMUT"
            : isSev2
            ? "İNSAN ONAYI // EYLEM PLANI"
            : "OTONOM AKIŞ"}
        </span>
      }
      contentClassName="p-3 space-y-3 flex flex-col justify-between min-h-[560px]"
    >
      <div className="space-y-3">
        {/* Incident Context Header */}
        <div className="border-[1.5px] border-[#522D60] bg-[#FAF6F2] p-2.5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span className="font-bold text-[#522D60] bg-[#FFD38B] px-1.5 py-0.2 border border-[#522D60]">
                {incident.incident_code}
              </span>
              <span className="font-bold text-[#80426E]">
                [{incident.service?.name} / {incident.service?.slug}]
              </span>
              <span className="text-[#522D60]">•</span>
              <span className="text-[#522D60]">
                {new Date(incident.created_at).toLocaleTimeString()}
              </span>
            </div>
            <div className="font-mono font-bold text-xs text-[#522D60] mt-1">
              {incident.title}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <OsBadge variant={isSev1 ? "sev1" : isSev2 ? "sev2" : "sev3"}>
              {incident.severity || "SEV-?"}
            </OsBadge>
            <OsBadge variant="paper">{incident.status.toUpperCase()}</OsBadge>
          </div>
        </div>

        {/* Guardrail Policy Strip */}
        <div
          className={`p-2 border-[1.5px] border-[#522D60] font-mono text-[11px] flex items-center gap-2 ${
            isSev1
              ? "bg-[#FFFFFF] text-[#D9383A]"
              : isSev2
              ? "bg-[#FAF6F2] text-[#522D60]"
              : "bg-[#FFFFFF] text-[#1E8E5A]"
          }`}
        >
          <span className="font-bold">
            {isSev1
              ? "🔒 OTONOMİ KİLİDİ:"
              : isSev2
              ? "🛡️ OTONOMİ KİLİDİ:"
              : "⚡ OTONOMİ MODU:"}
          </span>
          <span className="font-sans text-[11px]">
            {isSev1
              ? "Tam güvenlik modu devrede. Ajanın doğrudan müdahalesi engellenmiştir; yalnızca mühendis talimatıyla komut icra edilir."
              : isSev2
              ? "Ajan doğrudan müdahale edemez; hazırlanan çözüm planı nöbetçi mühendisin tek tıkla onayını bekler."
              : "Düşük riskli operasyon. Ajan çözümü kendi başına uygulama ve doğrulama yetkisine sahiptir."}
          </span>
        </div>

        {/* Raw Telemetry & Diagnostic Signal Box */}
        <div className="border-[1.5px] border-[#522D60] bg-[#FFFFFF] p-2.5 space-y-2">
          <div className="flex items-center justify-between border-b border-[#522D60]/20 pb-1">
            <span className="font-mono text-[10px] font-bold text-[#522D60] uppercase flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-[#522D60]" />
              YAKALANAN QUICKCART TELEMETRİ SİNYALİ
            </span>
            <span className="font-mono text-[9px] text-[#80426E]">
              Kaynak: QuickCart İstemcisi
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[10px]">
            {rawPayload.error_code ? (
              <div className="border border-[#522D60]/30 p-1.5 bg-[#FAF6F2]">
                <div className="text-[#80426E] text-[9px]">HATA KODU</div>
                <div className="font-bold text-[#522D60] truncate">
                  {String(rawPayload.error_code)}
                </div>
              </div>
            ) : null}

            {metrics.error_rate !== undefined ? (
              <div className="border border-[#522D60]/30 p-1.5 bg-[#FAF6F2]">
                <div className="text-[#80426E] text-[9px]">HATA ORANI</div>
                <div className="font-bold text-[#D9383A]">
                  %{((Number(metrics.error_rate) || 0) * 100).toFixed(0)}
                </div>
              </div>
            ) : null}

            {metrics.p99_latency_ms !== undefined ? (
              <div className="border border-[#522D60]/30 p-1.5 bg-[#FAF6F2]">
                <div className="text-[#80426E] text-[9px]">P99 GECİKME</div>
                <div className="font-bold text-[#522D60]">
                  {String(metrics.p99_latency_ms)} ms
                </div>
              </div>
            ) : null}
          </div>

          {rawPayload.message ? (
            <div className="text-[11px] font-mono text-[#522D60]/80 bg-[#FAF6F2] p-1.5 border border-[#522D60]/20 leading-tight">
              &quot;{String(rawPayload.message)}&quot;
            </div>
          ) : null}
        </div>

        {/* AI SRE Action Plan Blueprint (Ready for Module 4 & 5) */}
        {plan && (
          <div className="border-[1.5px] border-[#522D60] bg-[#FAF6F2] p-2.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-[#522D60]/30 pb-1.5">
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <span className="font-bold bg-[#F2A67B] text-[#522D60] px-1.5 py-0.2 border border-[#522D60]">
                  {plan.plan_id || "EYLEM PLANI"}
                </span>
                <span className="font-bold text-[#522D60]">
                  {plan.title || "Önerilen Sistem İyileştirmesi"}
                </span>
              </div>

              <div className="flex items-center gap-1.5 font-mono text-[10px]">
                {plan.tool_name && (
                  <span className="bg-[#FFFFFF] px-1.5 py-0.2 border border-[#522D60] text-[#522D60]">
                    Araç: <strong>{plan.tool_name}</strong>
                  </span>
                )}
                <span
                  className={`px-1.5 py-0.2 border border-[#522D60] font-bold ${
                    plan.risk_level === "high"
                      ? "bg-[#D9383A] text-[#FFFFFF]"
                      : plan.risk_level === "medium"
                      ? "bg-[#F2A67B] text-[#522D60]"
                      : "bg-[#1E8E5A] text-[#FFFFFF]"
                  }`}
                >
                  RİSK: {(plan.risk_level || "low").toUpperCase()}
                </span>
              </div>
            </div>

            {/* Steps */}
            {plan.steps && plan.steps.length > 0 && (
              <div className="space-y-1 font-mono text-[11px]">
                <div className="text-[10px] font-bold text-[#80426E] uppercase">
                  PLAN ADIMLARI (SIRALI İCRA):
                </div>
                <div className="space-y-1">
                  {plan.steps.map((st: string, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 bg-[#FFFFFF] p-1.5 border border-[#522D60]/20"
                    >
                      <span className="w-4 h-4 shrink-0 bg-[#522D60] text-[#FFFFFF] flex items-center justify-center text-[9px] font-bold">
                        {idx + 1}
                      </span>
                      <span className="text-[#522D60] leading-snug">{st}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Standby Action Trigger for Module 4/5 */}
            <div className="pt-1 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px]">
              <span className="text-[#80426E]">
                {isSev1
                  ? "• SEV-1 Kriz Modu: Yalnızca mühendis sohbet komutuyla icra edilebilir."
                  : isSev2
                  ? "• SEV-2 Onay Modu: Tek tıkla onay motoru Modül 4 ile bağlanacaktır."
                  : "• SEV-3 Otonom Modu: Ajan doğrudan icra yetkisine sahiptir."}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Terminal / Chat Command Console Shell (Wireframe Match) */}
      <div className="border-[1.5px] border-[#522D60] bg-[#FAF6F2] p-2 space-y-1.5 font-mono">
        <div className="flex items-center justify-between text-[10px] text-[#80426E]">
          <span>WAR ROOM MÜHENDİS KOMUTA SATIRI</span>
          <span className="text-[9px] bg-[#FFFFFF] px-1 border border-[#522D60]/30">
            Modül 4 & 5 Entegrasyon Yuvası
          </span>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            disabled
            placeholder="Mühendis direktifi veya soru yazın (Modül 5'te açılacaktır)..."
            className="flex-1 bg-[#FFFFFF] border-[1.5px] border-[#522D60] px-2 py-1.5 text-[11px] text-[#522D60]/60 cursor-not-allowed select-none"
          />
          <button
            type="button"
            disabled
            className="bg-[#522D60] text-[#FFFFFF] px-3 py-1.5 border-[1.5px] border-[#522D60] text-[11px] font-bold opacity-60 cursor-not-allowed select-none"
          >
            GÖNDER
          </button>
        </div>
      </div>
    </OsWindow>
  );
}
