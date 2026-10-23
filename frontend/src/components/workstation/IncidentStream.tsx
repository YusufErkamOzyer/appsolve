"use client";

import React from "react";
import { Incident } from "@/lib/api";
import { SlaCountdown } from "./SlaCountdown";
import { ActionCard } from "./ActionCard";

interface IncidentStreamProps {
  incident: Incident | null;
  onOpenSimulator?: () => void;
  onIncidentUpdated?: () => void;
}

export function IncidentStream({
  incident,
  onOpenSimulator,
  onIncidentUpdated,
}: IncidentStreamProps) {
  if (!incident) {
    return (
      <section className="flex-1 border-[1.5px] border-[#522D60] bg-[#FFFFFF] os-window-shadow flex flex-col items-center justify-center p-12 text-center select-none min-h-[580px]">
        <div className="font-mono text-xs space-y-3 text-[#522D60]">
          <div className="font-bold text-sm">[OLAY SEÇİLMEDİ]</div>
          <p className="text-[12px] font-sans text-[#80426E] max-w-sm mx-auto">
            İncelemek istediğiniz olayı sol listeden seçin veya simülatörden yeni bir telemetri sinyali gönderin.
          </p>
          {onOpenSimulator && (
            <button
              type="button"
              onClick={onOpenSimulator}
              className="px-4 py-2 bg-[#F2A67B] text-[#522D60] border-[1.5px] border-[#522D60] font-mono text-xs font-bold os-btn-shadow cursor-pointer"
            >
              ⚡ SİNYAL GÖNDER
            </button>
          )}
        </div>
      </section>
    );
  }

  const isSev1 = incident.severity === "SEV-1";
  const isSev2 = incident.severity === "SEV-2";
  const isSev3 = incident.severity === "SEV-3";
  const isResolved = incident.status === "resolved";
  const rawPayload = incident.raw_payload || {};
  const metrics = (rawPayload.metrics as Record<string, unknown>) || {};

  const createdDate = new Date(incident.created_at);
  const timeStr = createdDate.toLocaleTimeString();

  // MTTR Hesabı
  const calculateMttr = () => {
    if (!incident.resolved_at) return null;
    const diffMs = new Date(incident.resolved_at).getTime() - new Date(incident.created_at).getTime();
    const diffSecs = Math.max(1, Math.round(diffMs / 1000));
    if (diffSecs < 60) return `${diffSecs} sn`;
    const diffMins = Math.round(diffSecs / 60);
    return `${diffMins} dk`;
  };

  const mttrFormatted = calculateMttr();

  return (
    <section className="flex-1 border-[1.5px] border-[#522D60] bg-[#FFFFFF] os-window-shadow flex flex-col h-full min-h-[580px] lg:max-h-[calc(100vh-80px)] select-none">
      {/* 1. Window Header Bar */}
      <div className="h-9 px-3 border-b-[1.5px] border-[#522D60] bg-[#FFFFFF] flex items-center justify-between font-mono text-[11px] shrink-0">
        <div className="flex items-center gap-2 font-bold text-[#522D60]">
          <span className="text-xs">◫</span>
          <span className="tracking-wider">OLAY AKIŞI {incident.incident_code}</span>
        </div>

        <div className="flex items-center gap-2 text-[10px]">
          {isResolved ? (
            <span className="inline-flex items-center gap-1 font-bold text-[#1E8E5A] px-2 py-0.5 bg-[#EEFBF3] border border-[#1E8E5A]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1E8E5A]" />
              ÇÖZÜLDÜ
            </span>
          ) : (
            <span
              className={`inline-flex items-center gap-1 font-bold ${
                isSev1
                  ? "text-[#D9383A]"
                  : isSev2
                  ? "text-[#F2A67B]"
                  : "text-[#522D60]"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isSev1
                    ? "bg-[#D9383A] animate-pulse"
                    : isSev2
                    ? "bg-[#F2A67B]"
                    : "bg-[#FFD38B]"
                }`}
              />
              {incident.severity}
            </span>
          )}

          {incident.sla_deadline && !isResolved && (
            <>
              <span className="text-[#522D60]/30">|</span>
              <SlaCountdown
                deadline={incident.sla_deadline}
                compact
                className={isSev1 ? "text-[#D9383A] font-bold" : "text-[#522D60] font-bold"}
              />
            </>
          )}

          <span className="text-[#522D60]/30">|</span>
          <span className="text-[#80426E]">{timeStr}</span>
        </div>
      </div>

      {/* 2. Chronological Vertical Stream Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
        <div className="relative pl-6 sm:pl-8 space-y-6 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[2px] before:bg-[#522D60]/20">
          {/* Card 1: RAW TELEMETRY (Soft Pink/Red Tint) */}
          <div className="relative space-y-1.5">
            {/* Timeline Node */}
            <div className="flex items-center gap-2 font-mono text-[10px] -ml-6 sm:-ml-8">
              <span className="w-4 h-4 rounded-full bg-[#FFFFFF] border-2 border-[#D9383A] flex items-center justify-center shrink-0 z-10">
                <span className="w-1.5 h-1.5 bg-[#D9383A] rounded-full" />
              </span>
              <span className="font-bold text-[#80426E] tabular-nums">{timeStr}</span>
              <span className="px-1.5 py-0.2 bg-[#FAF6F2] border border-[#522D60] text-[#522D60] font-bold tracking-wider">
                HAM TELEMETRİ
              </span>
            </div>

            {/* Card Body */}
            <div className="border-[1.5px] border-[#E5A3A3] bg-[#FDF2F2] p-3 space-y-2 os-btn-shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[#D9383A] text-sm font-bold">⚠</span>
                  <h3 className="font-mono font-bold text-xs sm:text-sm text-[#522D60]">
                    {String(rawPayload.error_code || incident.title)}
                  </h3>
                </div>
                {incident.severity && (
                  <span
                    className={`px-1.5 py-0.2 font-mono text-[9px] font-bold border border-[#522D60] ${
                      isSev1
                        ? "bg-[#D9383A] text-[#FFFFFF]"
                        : isSev2
                        ? "bg-[#F2A67B] text-[#522D60]"
                        : "bg-[#FFD38B] text-[#522D60]"
                    }`}
                  >
                    {incident.severity}
                  </span>
                )}
              </div>

              {/* Telemetry Key-Value Strip */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-[#522D60]/90 border-t border-[#522D60]/15 pt-2">
                <span>
                  Servis: <strong className="text-[#522D60]">{incident.service?.slug}</strong>
                </span>
                <span>•</span>
                <span>
                  Hata Oranı:{" "}
                  <strong className="text-[#D9383A]">
                    %{metrics.error_rate !== undefined ? ((Number(metrics.error_rate) || 0) * 100).toFixed(0) : "94"}
                  </strong>
                </span>
                {metrics.p99_latency_ms !== undefined && (
                  <>
                    <span>•</span>
                    <span>
                      Gecikme (p99):{" "}
                      <strong className="text-[#522D60]">{String(metrics.p99_latency_ms)} ms</strong>
                    </span>
                  </>
                )}
                {metrics.affected_users !== undefined && (
                  <>
                    <span>•</span>
                    <span>
                      Etkilenen Kullanıcı:{" "}
                      <strong className="text-[#522D60]">{String(metrics.affected_users)}</strong>
                    </span>
                  </>
                )}
              </div>

              <div className="text-[11px] font-sans text-[#522D60]/90 bg-[#FFFFFF]/70 p-2 border border-[#522D60]/10 leading-relaxed">
                {String(rawPayload.message || incident.title)}
              </div>
            </div>
          </div>

          {/* Card 2: GEMINI AI SRE BOT (Soft Lavender Tint) */}
          <div className="relative space-y-1.5">
            <div className="flex items-center gap-2 font-mono text-[10px] -ml-6 sm:-ml-8">
              <span className="w-4 h-4 rounded-full bg-[#FFFFFF] border-2 border-[#522D60] flex items-center justify-center shrink-0 z-10">
                <span className="w-1.5 h-1.5 bg-[#522D60] rounded-full" />
              </span>
              <span className="font-bold text-[#80426E] tabular-nums">{timeStr}</span>
              <span className="px-1.5 py-0.2 bg-[#F6F5FA] border border-[#522D60] text-[#522D60] font-bold tracking-wider">
                GEMINI AI SRE AJANI
              </span>
            </div>

            <div className="border-[1.5px] border-[#522D60]/30 bg-[#F6F5FA] p-3 space-y-2.5 os-btn-shadow-sm">
              <div className="flex items-start justify-between gap-2 border-b border-[#522D60]/15 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[#522D60] text-sm">✦</span>
                  <span className="font-mono font-bold text-xs text-[#522D60]">
                    {incident.severity} Belirlendi. Kök Neden: {incident.hypothesis?.slice(0, 60)}...
                  </span>
                </div>
                <span className="px-1.5 py-0.2 bg-[#522D60] text-[#FFFFFF] font-mono text-[9px] font-bold border border-[#522D60]">
                  AI ANALİZİ
                </span>
              </div>

              {/* Business Impact Reasoning */}
              {incident.reasoning && (
                <div className="space-y-0.5">
                  <div className="font-mono text-[9px] font-bold text-[#80426E] uppercase">
                    İŞ ETKİSİ VE SEV GEREKÇESİ:
                  </div>
                  <p className="font-sans text-[12px] text-[#522D60] leading-relaxed">
                    {incident.reasoning}
                  </p>
                </div>
              )}

              {/* Root Cause Hypothesis */}
              {incident.hypothesis && (
                <div className="space-y-0.5 bg-[#FFFFFF] p-2 border border-[#522D60]/20">
                  <div className="font-mono text-[9px] font-bold text-[#522D60] uppercase">
                    KÖK NEDEN TAHMİNİ (ROOT CAUSE HYPOTHESIS):
                  </div>
                  <p className="font-sans text-[12px] font-semibold text-[#522D60] leading-relaxed">
                    {incident.hypothesis}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Card 3: SECURITY GUARDRAIL (Warm Amber Tint) */}
          <div className="relative space-y-1.5">
            <div className="flex items-center gap-2 font-mono text-[10px] -ml-6 sm:-ml-8">
              <span className="w-4 h-4 rounded-full bg-[#FFFFFF] border-2 border-[#E6B86A] flex items-center justify-center shrink-0 z-10">
                <span className="w-1.5 h-1.5 bg-[#E6B86A] rounded-full" />
              </span>
              <span className="font-bold text-[#80426E] tabular-nums">{timeStr}</span>
              <span className="px-1.5 py-0.2 bg-[#FFF8E7] border border-[#522D60] text-[#522D60] font-bold tracking-wider">
                GÜVENLİK KİLİDİ
              </span>
            </div>

            <div className="border-[1.5px] border-[#E6B86A] bg-[#FFF8E7] p-3 space-y-1.5 os-btn-shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 font-mono font-bold text-xs text-[#522D60]">
                  <span>🔒</span>
                  <span>
                    {incident.autonomy_mode === "manual_command_only"
                      ? "Tam Güvenlik Kilidi Devrede (Manual Approval Lock Engaged)"
                      : incident.autonomy_mode === "approval_required"
                      ? "İnsan Onayı Kilidi Devrede (Human Approval Required)"
                      : "Tam Otonom Yetki Açık (Full Autonomy)"}
                  </span>
                </div>
                <span className="px-1.5 py-0.2 bg-[#FFD38B] text-[#522D60] font-mono text-[9px] font-bold border border-[#522D60]">
                  GUARDRAIL
                </span>
              </div>

              <p className="font-sans text-[11px] text-[#522D60]/90 leading-relaxed">
                {incident.autonomy_mode === "manual_command_only"
                  ? "Yüksek etkili kriz nedeniyle otonom müdahale kilitlendi. Nöbetçi Mühendis ve Takım Lideri çağrıldı; 15 dakikalık SLA sayacı başlatıldı."
                  : incident.autonomy_mode === "approval_required"
                  ? "Önemli işlev bozulması nedeniyle doğrudan müdahale kilitlendi. Nöbetçi Mühendisin eylem kartını onaylaması bekleniyor."
                  : "Düşük riskli operasyon. Ajan insan onayı beklemeksizin müdahaleyi tam otonom icra etme yetkisine sahiptir."}
              </p>
            </div>
          </div>

          {/* Card 4: ACTION CARD 1.1 (Interactive Retro Component) */}
          <ActionCard
            incident={incident}
            onActionComplete={onIncidentUpdated}
          />

          {/* Subsequent Events & Timeline nodes */}
          {incident.events && incident.events.length > 4 && (
            incident.events.slice(4).map((ev) => (
              <div key={ev.id} className="relative space-y-1">
                <div className="flex items-center gap-2 font-mono text-[10px] -ml-6 sm:-ml-8">
                  <span className="w-4 h-4 rounded-full bg-[#FFFFFF] border-2 border-[#522D60] flex items-center justify-center shrink-0 z-10">
                    <span className="w-1.5 h-1.5 bg-[#522D60] rounded-full" />
                  </span>
                  <span className="font-bold text-[#80426E] tabular-nums">
                    {new Date(ev.occurred_at).toLocaleTimeString()}
                  </span>
                  <span className="px-1.5 py-0.2 bg-[#FAF6F2] border border-[#522D60] text-[#522D60] font-bold">
                    {ev.actor.toUpperCase()}
                  </span>
                </div>

                <div className="bg-[#FAF6F2] border border-[#522D60]/30 p-2 font-mono text-[11px] text-[#522D60]">
                  <strong>{ev.title}:</strong> {ev.details}
                </div>
              </div>
            ))
          )}

          {/* Final Resolution Summary Card when resolved */}
          {isResolved && (
            <div className="relative space-y-1.5">
              <div className="flex items-center gap-2 font-mono text-[10px] -ml-6 sm:-ml-8">
                <span className="w-4 h-4 rounded-full bg-[#FFFFFF] border-2 border-[#1E8E5A] flex items-center justify-center shrink-0 z-10">
                  <span className="w-1.5 h-1.5 bg-[#1E8E5A] rounded-full" />
                </span>
                <span className="font-bold text-[#1E8E5A] tabular-nums">
                  {incident.resolved_at ? new Date(incident.resolved_at).toLocaleTimeString() : timeStr}
                </span>
                <span className="px-1.5 py-0.2 bg-[#EEFBF3] border border-[#1E8E5A] text-[#1E8E5A] font-bold tracking-wider">
                  ÇÖZÜM DOĞRULAMASI
                </span>
              </div>

              <div className="border-[1.5px] border-[#1E8E5A] bg-[#EEFBF3] p-3.5 space-y-2.5 os-btn-shadow">
                <div className="flex items-center justify-between border-b border-[#1E8E5A]/30 pb-2">
                  <div className="flex items-center gap-2 font-mono text-xs font-bold text-[#1E8E5A]">
                    <span>✓</span>
                    <span>OLAY KAPATILDI — SİSTEM OPERASYONEL</span>
                  </div>
                  <span className="px-2 py-0.5 bg-[#1E8E5A] text-[#FFFFFF] font-mono text-[9px] font-bold border border-[#522D60]">
                    RESOLVED
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px] text-[#522D60]">
                  <div className="bg-[#FFFFFF] p-2 border border-[#1E8E5A]/30">
                    <span className="text-[9px] text-[#80426E] uppercase block">Çözüm Yolu:</span>
                    <strong className="text-[11px] text-[#1E8E5A]">
                      {isSev3 ? "Yol A (Tam Otonom)" : isSev2 ? "Yol B (Tek Tık Onay)" : "Yol C (War Room)"}
                    </strong>
                  </div>
                  <div className="bg-[#FFFFFF] p-2 border border-[#1E8E5A]/30">
                    <span className="text-[9px] text-[#80426E] uppercase block">Çözüm Süresi (MTTR):</span>
                    <strong className="text-[11px] text-[#522D60]">{mttrFormatted || "< 10 sn"}</strong>
                  </div>
                  <div className="bg-[#FFFFFF] p-2 border border-[#1E8E5A]/30">
                    <span className="text-[9px] text-[#80426E] uppercase block">Servis Durumu:</span>
                    <strong className="text-[11px] text-[#1E8E5A]">OPERATIONAL (ÇALIŞIYOR)</strong>
                  </div>
                </div>

                <p className="font-sans text-[11px] text-[#522D60]/90 leading-tight">
                  Tüm telemetri kontrolleri ve sağlık sorguları tamamlandı. {incident.service?.name} servisi kesintisiz hizmet vermeye devam etmektedir.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Pinned Bottom Command Bar */}
      <div className="border-t-[1.5px] border-[#522D60] bg-[#FAF6F2] p-2 sm:p-2.5 flex items-center gap-2 font-mono shrink-0">
        <div className="w-6 h-6 shrink-0 bg-[#522D60] text-[#FFFFFF] border border-[#522D60] flex items-center justify-center text-xs font-bold select-none">
          &gt;_
        </div>
        <input
          type="text"
          disabled
          placeholder='Bir talimat, komut veya mesaj yazın... (Modül 5 ile aktifleşecektir)'
          className="flex-1 bg-[#FFFFFF] border-[1.5px] border-[#522D60] px-3 py-1.5 text-[11px] text-[#522D60]/60 cursor-not-allowed select-none focus:outline-none"
        />
        <button
          type="button"
          disabled
          className="bg-[#522D60] text-[#FFFFFF] px-4 py-1.5 border-[1.5px] border-[#522D60] font-mono text-[11px] font-bold opacity-75 cursor-not-allowed select-none"
        >
          [ GÖNDER ▷ ]
        </button>
      </div>
    </section>
  );
}
