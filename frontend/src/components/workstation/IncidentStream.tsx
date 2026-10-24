"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Incident, sendWarRoomMessage } from "@/lib/api";
import { SlaCountdown } from "./SlaCountdown";
import { ActionCard } from "./ActionCard";
import { PostMortemViewer } from "./PostMortemViewer";

interface IncidentStreamProps {
  incident: Incident | null;
  onOpenSimulator?: () => void;
  onIncidentUpdated?: () => void;
}

const QUICK_PROMPTS = [
  {
    label: "🔍 Hatayı ve Kök Nedeni Açıkla",
    prompt: "@solver tespit edilen hatayı, kök neden hipotezini ve iş etkisini detaylı açıkla",
  },
  {
    label: "⚡ Yeni Bir Kurtarma Planı Hazırla",
    prompt: "@solver kilitli işlemleri sonlandırıp bağlantı havuzunu sıfırlayan yeni bir plan oluştur",
  },
  {
    label: "🔄 Planı Güncelle: Replikaya Geç",
    prompt: "@solver planı güncelle: Kilitleri temizle ve trafiği geçici olarak ikincil replikaya yönlendir",
  },
  {
    label: "✓ Servisi Doğrula ve Olayı Kapat",
    prompt: "@solver servis sağlığını doğrula ve olayı çözüldü olarak kapat",
  },
];

export function IncidentStream({
  incident,
  onOpenSimulator,
  onIncidentUpdated,
}: IncidentStreamProps) {
  const [commandInput, setCommandInput] = useState<string>("");
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [activeViewTab, setActiveViewTab] = useState<"stream" | "post_mortem">("stream");
  const streamEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-switch to post-mortem tab or stream based on incident resolution
  const prevIncidentIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (incident?.id !== prevIncidentIdRef.current) {
      prevIncidentIdRef.current = incident?.id || null;
      // Default to stream view on new selection
      setActiveViewTab("stream");
    }
  }, [incident?.id]);

  // Auto-scroll to bottom of stream when messages update
  useEffect(() => {
    if (incident?.messages && incident.messages.length > 0) {
      streamEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [incident?.messages?.length, incident?.status]);

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

  const handleSendCommand = async (textToSend?: string) => {
    const text = (textToSend || commandInput).trim();
    if (!text || isSending || isResolved) return;

    setIsSending(true);
    setSendError(null);

    try {
      await sendWarRoomMessage(incident.id, text, "Nöbetçi Mühendis (On-Call SRE)");
      setCommandInput("");
      if (onIncidentUpdated) {
        onIncidentUpdated();
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Mesaj gönderilirken hata oluştu.");
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const handleRequestRevision = (planId: string) => {
    const template = `@solver ${planId} planını şu şekilde revize et: `;
    setCommandInput(template);
    inputRef.current?.focus();
  };

  const warRoomMessages = incident.messages || [];

  return (
    <section className="flex-1 border-[1.5px] border-[#522D60] bg-[#FFFFFF] os-window-shadow flex flex-col h-full min-h-[580px] lg:max-h-[calc(100vh-80px)] select-none">
      {/* 1. Window Header Bar */}
      <div className="h-9 px-3 border-b-[1.5px] border-[#522D60] bg-[#FFFFFF] flex items-center justify-between font-mono text-[11px] shrink-0">
        <div className="flex items-center gap-2 font-bold text-[#522D60]">
          <span className="text-xs">◫</span>
          <span className="tracking-wider">WAR ROOM // {incident.incident_code}</span>
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

          <span className="text-[#522D60]/30">|</span>
          <Link
            href="/status"
            className="hover:underline text-[#522D60] font-bold inline-flex items-center gap-1 text-[10px] bg-[#FAF6F2] px-1.5 py-0.5 border border-[#522D60]"
            title="Müşteri Durum Sayfasını Görüntüle"
          >
            <span className="w-1.5 h-1.5 bg-[#1E8E5A] rounded-full" />
            <span>Müşteri Sayfası (/status)</span>
          </Link>
        </div>
      </div>

      {/* Dual Mode Switcher Bar when Resolved */}
      {isResolved && (
        <div className="h-8 px-3 border-b-[1.5px] border-[#522D60] bg-[#FAF6F2] flex items-center justify-between font-mono text-[10px] shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveViewTab("stream")}
              className={`px-2.5 py-0.5 border cursor-pointer font-bold transition-none ${
                activeViewTab === "stream"
                  ? "bg-[#522D60] text-[#FFFFFF] border-[#522D60]"
                  : "bg-[#FFFFFF] text-[#522D60] border-[#522D60]/30 hover:bg-[#FAF6F2]"
              }`}
            >
              💬 WAR ROOM AKIŞI
            </button>
            <button
              type="button"
              onClick={() => setActiveViewTab("post_mortem")}
              className={`px-2.5 py-0.5 border cursor-pointer font-bold transition-none flex items-center gap-1.5 ${
                activeViewTab === "post_mortem"
                  ? "bg-[#1E8E5A] text-[#FFFFFF] border-[#1E8E5A]"
                  : "bg-[#FFFFFF] text-[#522D60] border-[#522D60]/30 hover:bg-[#FAF6F2]"
              }`}
            >
              <span>📄 POST-MORTEM RAPORU 1.1</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#1E8E5A]" />
            </button>
          </div>

          <div className="flex items-center gap-2 text-[#80426E]">
            <span className="font-bold">MTTR: {mttrFormatted || "< 10 sn"}</span>
            <span className="text-[#522D60]/30">•</span>
            <span>{incident.post_mortem ? "Rapor Hazır ✓" : "Rapor Bekleniyor"}</span>
          </div>
        </div>
      )}

      {activeViewTab === "post_mortem" && isResolved ? (
        <div className="flex-1 overflow-y-auto">
          <PostMortemViewer
            incident={incident}
            onPostMortemUpdated={onIncidentUpdated}
          />
        </div>
      ) : (
        <>
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

          {/* Card 2: AI TRIAGE & HYPOTHESIS (Soft Lavender Tint) */}
          <div className="relative space-y-1.5">
            <div className="flex items-center gap-2 font-mono text-[10px] -ml-6 sm:-ml-8">
              <span className="w-4 h-4 rounded-full bg-[#FFFFFF] border-2 border-[#522D60] flex items-center justify-center shrink-0 z-10">
                <span className="w-1.5 h-1.5 bg-[#522D60] rounded-full" />
              </span>
              <span className="font-bold text-[#80426E] tabular-nums">{timeStr}</span>
              <span className="px-1.5 py-0.2 bg-[#F6F5FA] border border-[#522D60] text-[#522D60] font-bold tracking-wider">
                @SOLVER AI SRE AJANI
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
                  AI TRIAGE
                </span>
              </div>

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
                  ? "Kritik SEV-1 krizi nedeniyle izinsiz otonom müdahale kilitlendi. @solver tarafından sunulan implementasyon planları nöbetçi mühendisin tek tıkla onayıyla veya sohbet yönergeleriyle icra edilir."
                  : incident.autonomy_mode === "approval_required"
                  ? "Önemli işlev bozulması nedeniyle doğrudan müdahale kilitlendi. Nöbetçi Mühendisin eylem kartını onaylaması bekleniyor."
                  : "Düşük riskli operasyon. Ajan insan onayı beklemeksizin müdahaleyi tam otonom icra etme yetkisine sahiptir."}
              </p>
            </div>
          </div>

          {/* 3. WAR ROOM COLLABORATIVE FEED (Messages, Plans & Diagnostics) */}
          {warRoomMessages.length > 0 ? (
            warRoomMessages.map((msg) => {
              const msgDate = new Date(msg.created_at);
              const msgTime = msgDate.toLocaleTimeString();

              // Type A: Action Card / Implementation Plan
              if (msg.message_type === "action_card") {
                return (
                  <ActionCard
                    key={msg.id}
                    incident={incident}
                    message={msg}
                    onActionComplete={onIncidentUpdated}
                    onRequestRevision={handleRequestRevision}
                  />
                );
              }

              // Type B: System Diagnostic Terminal Box
              if (msg.message_type === "system_diagnostic") {
                return (
                  <div key={msg.id} className="relative space-y-1.5">
                    <div className="flex items-center gap-2 font-mono text-[10px] -ml-6 sm:-ml-8">
                      <span className="w-4 h-4 rounded-full bg-[#FFFFFF] border-2 border-[#1E8E5A] flex items-center justify-center shrink-0 z-10">
                        <span className="w-1.5 h-1.5 bg-[#1E8E5A] rounded-full" />
                      </span>
                      <span className="font-bold text-[#80426E] tabular-nums">{msgTime}</span>
                      <span className="px-1.5 py-0.2 bg-[#EEFBF3] border border-[#1E8E5A] text-[#1E8E5A] font-bold tracking-wider">
                        @SOLVER SİSTEM TANI RAPORU
                      </span>
                    </div>

                    <div className="border-[1.5px] border-[#522D60] bg-[#1A1024] p-3 space-y-2 os-btn-shadow">
                      <div className="flex items-center justify-between border-b border-white/20 pb-1.5">
                        <span className="font-mono text-[10px] font-bold text-[#8DFFA9] flex items-center gap-1.5">
                          <span>&gt;_</span>
                          <span>DIAGNOSTIC &amp; TELEMETRY OUTPUT</span>
                        </span>
                        <span className="font-mono text-[9px] text-white/50">PostgreSQL / Redis Engine</span>
                      </div>
                      <pre className="text-[10px] font-mono text-[#8DFFA9] leading-tight overflow-x-auto max-h-48 whitespace-pre-wrap">
                        {msg.content}
                      </pre>
                    </div>
                  </div>
                );
              }

              // Type C: Engineer Message
              if (msg.sender_type === "engineer") {
                return (
                  <div key={msg.id} className="relative space-y-1.5">
                    <div className="flex items-center gap-2 font-mono text-[10px] -ml-6 sm:-ml-8">
                      <span className="w-4 h-4 rounded-full bg-[#FFFFFF] border-2 border-[#522D60] flex items-center justify-center shrink-0 z-10">
                        <span className="w-1.5 h-1.5 bg-[#522D60] rounded-full" />
                      </span>
                      <span className="font-bold text-[#80426E] tabular-nums">{msgTime}</span>
                      <span className="px-1.5 py-0.2 bg-[#522D60] text-[#FFFFFF] font-mono text-[10px] font-bold">
                        👨‍💻 {msg.sender_name.toUpperCase()}
                      </span>
                    </div>

                    <div className="border-[1.5px] border-[#522D60] bg-[#FAF6F2] p-3 space-y-1 os-btn-shadow-sm">
                      <p className="font-sans text-[12px] text-[#522D60] font-medium leading-relaxed">
                        {msg.content}
                      </p>
                    </div>
                  </div>
                );
              }

              // Type D: @solver Text Message
              return (
                <div key={msg.id} className="relative space-y-1.5">
                  <div className="flex items-center gap-2 font-mono text-[10px] -ml-6 sm:-ml-8">
                    <span className="w-4 h-4 rounded-full bg-[#FFFFFF] border-2 border-[#80426E] flex items-center justify-center shrink-0 z-10">
                      <span className="w-1.5 h-1.5 bg-[#80426E] rounded-full" />
                    </span>
                    <span className="font-bold text-[#80426E] tabular-nums">{msgTime}</span>
                    <span className="px-1.5 py-0.2 bg-[#80426E] text-[#FFFFFF] font-mono text-[10px] font-bold">
                      ✦ @SOLVER
                    </span>
                  </div>

                  <div className="border-[1.5px] border-[#80426E]/40 bg-[#F6F5FA] p-3 space-y-1.5 os-btn-shadow-sm">
                    <p className="font-sans text-[12px] text-[#522D60] leading-relaxed whitespace-pre-line">
                      {msg.content}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            /* Fallback single action card if messages empty */
            <ActionCard
              incident={incident}
              onActionComplete={onIncidentUpdated}
              onRequestRevision={handleRequestRevision}
            />
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
                    <span className="text-[9px] text-[#80426E] uppercase block">Çözüm Modeli:</span>
                    <strong className="text-[11px] text-[#1E8E5A]">
                      {isSev3 ? "Yol A (Tam Otonom)" : isSev2 ? "Yol B (Tek Tık Onay)" : "Yol C (@solver War Room)"}
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
                  Tüm telemetri kontrolleri ve sentetik sağlık sorguları başarıyla tamamlandı. {incident.service?.name} servisi kesintisiz hizmet vermektedir.
                </p>
              </div>
            </div>
          )}

          {/* Embedded Post-Mortem Document in Stream View */}
          {isResolved && (
            <div className="relative space-y-2 pt-2">
              <div className="flex items-center gap-2 font-mono text-[10px] -ml-6 sm:-ml-8">
                <span className="w-4 h-4 rounded-full bg-[#FFFFFF] border-2 border-[#522D60] flex items-center justify-center shrink-0 z-10">
                  <span className="w-1.5 h-1.5 bg-[#522D60] rounded-full" />
                </span>
                <span className="font-bold text-[#80426E] tabular-nums">
                  {incident.resolved_at ? new Date(incident.resolved_at).toLocaleTimeString() : timeStr}
                </span>
                <span className="px-1.5 py-0.2 bg-[#522D60] text-[#FFFFFF] font-bold tracking-wider">
                  OTOMATİK POST-MORTEM (POSTMORTEM 1.1)
                </span>
              </div>

              <PostMortemViewer
                incident={incident}
                onPostMortemUpdated={onIncidentUpdated}
                compact
              />
            </div>
          )}

          {/* Anchor for auto-scroll */}
          <div ref={streamEndRef} />
        </div>
      </div>

      {/* 4. Active Command Bar with Quick @solver Chips */}
      <div className="border-t-[1.5px] border-[#522D60] bg-[#FAF6F2] p-2 sm:p-2.5 space-y-2 shrink-0">
        {sendError && (
          <div className="text-[10px] font-mono text-[#D9383A] bg-[#FDF2F2] p-1.5 border border-[#D9383A]">
            [HATA] {sendError}
          </div>
        )}

        {/* Quick @solver Prompt Chips */}
        {!isResolved && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[10px] font-mono scrollbar-none">
            <span className="text-[#80426E] font-bold shrink-0 text-[9px] uppercase">
              HIZLI TALİMAT:
            </span>
            {QUICK_PROMPTS.map((qp, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendCommand(qp.prompt)}
                disabled={isSending}
                className="shrink-0 px-2 py-0.5 bg-[#FFFFFF] hover:bg-[#FFD38B] text-[#522D60] border border-[#522D60]/40 font-mono text-[10px] font-semibold cursor-pointer transition-none disabled:opacity-50"
              >
                {qp.label}
              </button>
            ))}
          </div>
        )}

        {/* Command Input Row */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendCommand();
          }}
          className="flex items-center gap-2 font-mono"
        >
          <div className="w-6 h-6 shrink-0 bg-[#522D60] text-[#FFFFFF] border border-[#522D60] flex items-center justify-center text-xs font-bold select-none">
            &gt;_
          </div>

          <input
            ref={inputRef}
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            disabled={isResolved || isSending}
            placeholder={
              isResolved
                ? "Olay çözüldü — War Room arşivlendi."
                : isSending
                ? "@solver düşünüyor ve yanıt hazırlıyor..."
                : "@solver'a bir talimat verin veya soru sorun... (örn: '@solver hatayı açıkla' veya '@solver yeni bir kurtarma planı hazırla')"
            }
            className="flex-1 bg-[#FFFFFF] border-[1.5px] border-[#522D60] px-3 py-1.5 text-[11px] text-[#522D60] focus:outline-none disabled:bg-[#FAF6F2] disabled:text-[#522D60]/50"
          />

          <button
            type="submit"
            disabled={isResolved || isSending || !commandInput.trim()}
            className="bg-[#522D60] hover:bg-[#80426E] text-[#FFFFFF] px-4 py-1.5 border-[1.5px] border-[#522D60] font-mono text-[11px] font-bold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none transition-none flex items-center gap-1.5"
          >
            {isSending ? (
              <span>⏳ YANITLANIYOR...</span>
            ) : (
              <span>[ GÖNDER ▷ ]</span>
            )}
          </button>
        </form>
      </div>
    </>
  )}
</section>
  );
}
