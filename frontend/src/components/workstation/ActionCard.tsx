"use client";

import React, { useState } from "react";
import { Incident, ActionCardPayload, approveIncidentPlan, rejectIncidentPlan } from "@/lib/api";

interface ActionCardProps {
  incident: Incident;
  onActionComplete?: () => void;
}

export function ActionCard({ incident, onActionComplete }: ActionCardProps) {
  const [loadingAction, setLoadingAction] = useState<"approve" | "reject" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState<boolean>(true);

  const plan = incident.recommended_action_plan;
  const isSev1 = incident.severity === "SEV-1";
  const isSev2 = incident.severity === "SEV-2";
  const isSev3 = incident.severity === "SEV-3";
  const isResolved = incident.status === "resolved";

  // War Room içindeki en güncel action_card mesajını bul
  const actionCardMsg = incident.messages?.find((m) => m.message_type === "action_card");
  const payload: ActionCardPayload = actionCardMsg?.action_card_payload || {};
  const actionStatus = actionCardMsg?.action_status || (isResolved && isSev3 ? "autonomous_executed" : isSev2 ? "pending" : isSev1 ? "locked" : null);

  if (!plan && !actionCardMsg) {
    return null;
  }

  const planId = payload.plan_id || plan?.plan_id || "PLAN #01";
  const title = payload.title || plan?.title || "Sistem İyileştirme Planı";
  const toolName = payload.tool_name || plan?.tool_name || "system_tool";
  const riskLevel = (payload.risk_level || plan?.risk_level || (isSev3 ? "low" : isSev2 ? "medium" : "high")).toLowerCase();
  const steps = payload.steps || plan?.steps || [];
  const terminalOutput = payload.terminal_output;
  const verificationSummary = payload.verification_summary;

  const handleApprove = async () => {
    if (loadingAction || isResolved) return;
    setLoadingAction("approve");
    setActionError(null);
    try {
      await approveIncidentPlan(incident.id, "Nöbetçi Mühendis (On-Call SRE)");
      if (onActionComplete) onActionComplete();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Plan onaylanırken hata oluştu.");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleReject = async () => {
    if (loadingAction || isResolved) return;
    if (!confirm("Bu otomatik planı reddedip War Room üzerinden manuel müdahaleye geçmek istediğinize emin misiniz?")) {
      return;
    }
    setLoadingAction("reject");
    setActionError(null);
    try {
      await rejectIncidentPlan(incident.id, "Nöbetçi Mühendis (On-Call SRE)", "Mühendis tarafından manuel müdahale tercih edildi.");
      if (onActionComplete) onActionComplete();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Plan reddedilirken hata oluştu.");
    } finally {
      setLoadingAction(null);
    }
  };

  // Kart Durum Rozeti
  const renderStatusBadge = () => {
    if (actionStatus === "autonomous_executed" || (isSev3 && isResolved)) {
      return (
        <span className="px-2 py-0.5 bg-[#1E8E5A] text-[#FFFFFF] font-mono text-[9px] font-bold border border-[#522D60] inline-flex items-center gap-1">
          <span>✓</span> OTONOM UYGULANDI
        </span>
      );
    }
    if (actionStatus === "executed" || (isSev2 && isResolved)) {
      return (
        <span className="px-2 py-0.5 bg-[#1E8E5A] text-[#FFFFFF] font-mono text-[9px] font-bold border border-[#522D60] inline-flex items-center gap-1">
          <span>✓</span> ONAYLANDI VE UYGULANDI
        </span>
      );
    }
    if (actionStatus === "rejected") {
      return (
        <span className="px-2 py-0.5 bg-[#80426E] text-[#FFFFFF] font-mono text-[9px] font-bold border border-[#522D60]">
          ✕ PLAN REDDEDİLDİ
        </span>
      );
    }
    if (isSev1 || actionStatus === "locked") {
      return (
        <span className="px-2 py-0.5 bg-[#D9383A] text-[#FFFFFF] font-mono text-[9px] font-bold border border-[#522D60] inline-flex items-center gap-1">
          <span>🔒</span> TAM KİLİT (SEV-1)
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 bg-[#F2A67B] text-[#522D60] font-mono text-[9px] font-bold border border-[#522D60] animate-pulse">
        ● ONAY BEKLİYOR
      </span>
    );
  };

  const isExecuted = actionStatus === "executed" || actionStatus === "autonomous_executed" || isResolved;
  const isRejected = actionStatus === "rejected";

  return (
    <div className="relative space-y-1.5 select-none">
      {/* Timeline Node Connector */}
      <div className="flex items-center gap-2 font-mono text-[10px] -ml-6 sm:-ml-8">
        <span
          className={`w-4 h-4 rounded-full bg-[#FFFFFF] border-2 flex items-center justify-center shrink-0 z-10 ${
            isExecuted ? "border-[#1E8E5A]" : isSev1 ? "border-[#D9383A]" : "border-[#522D60]"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isExecuted ? "bg-[#1E8E5A]" : isSev1 ? "bg-[#D9383A]" : "bg-[#522D60]"
            }`}
          />
        </span>
        <span className="font-bold text-[#80426E] tabular-nums">
          {new Date(actionCardMsg?.created_at || incident.created_at).toLocaleTimeString()}
        </span>
        <span className="px-1.5 py-0.2 bg-[#FFFFFF] border border-[#522D60] text-[#522D60] font-bold tracking-wider">
          EYLEM KARTI
        </span>
      </div>

      {/* Main Card Container */}
      <div className="border-[1.5px] border-[#522D60] bg-[#FFFFFF] p-3.5 space-y-3 os-btn-shadow">
        {/* Card Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#522D60]/20 pb-2">
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-[#522D60] text-sm">📋</span>
            <span className="font-bold text-[#522D60] tracking-tight">
              {planId}: {title}
            </span>
          </div>
          {renderStatusBadge()}
        </div>

        {/* Error Alert if any */}
        {actionError && (
          <div className="border border-[#D9383A] bg-[#FDF2F2] p-2 font-mono text-[11px] text-[#D9383A] flex items-center justify-between">
            <span>[HATA] {actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-[#D9383A] font-bold px-1 hover:underline cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* 2-Column Responsive Body */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-start">
          {/* Left Column (7 cols): Steps & Hypothesis */}
          <div className="md:col-span-7 space-y-2.5 font-mono text-[11px]">
            {/* Hypothesis Cue if available */}
            {incident.hypothesis && (
              <div className="bg-[#FAF6F2] p-2 border border-[#522D60]/20 text-[10px] space-y-0.5">
                <span className="font-bold text-[#80426E] uppercase">Hedef Kök Neden:</span>
                <p className="font-sans text-[11px] text-[#522D60] leading-snug">
                  {incident.hypothesis}
                </p>
              </div>
            )}

            {/* Steps List */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold text-[#522D60] uppercase tracking-wider">
                Plan Adımları ({steps.length}):
              </div>
              {steps.map((st, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-2 p-1.5 border leading-snug transition-none ${
                    isExecuted
                      ? "bg-[#EEFBF3] border-[#1E8E5A]/40 text-[#1E8E5A]"
                      : "bg-[#FAF6F2] border-[#522D60]/20 text-[#522D60]"
                  }`}
                >
                  <span
                    className={`w-4 h-4 shrink-0 rounded-full flex items-center justify-center text-[9px] font-bold ${
                      isExecuted
                        ? "bg-[#1E8E5A] text-[#FFFFFF]"
                        : "bg-[#522D60] text-[#FFFFFF]"
                    }`}
                  >
                    {isExecuted ? "✓" : idx + 1}
                  </span>
                  <span className={isExecuted ? "font-semibold text-[#1E8E5A]" : "text-[#522D60]"}>
                    {st}
                  </span>
                </div>
              ))}
            </div>

            {/* Verification summary if already resolved */}
            {verificationSummary && (
              <div className="p-2 border border-[#1E8E5A] bg-[#EEFBF3] text-[10px] text-[#1E8E5A] font-mono">
                <strong>[DOĞRULAMA]</strong> {verificationSummary}
              </div>
            )}
          </div>

          {/* Right Column (5 cols): Metadata Table & CTA Actions */}
          <div className="md:col-span-5 md:border-l md:border-[#522D60]/20 md:pl-3.5 space-y-3 font-mono text-[11px]">
            {/* Metadata KV */}
            <div className="space-y-1 bg-[#FAF6F2] p-2.5 border border-[#522D60]/20 text-[10px] text-[#80426E]">
              <div className="flex justify-between items-center py-0.5 border-b border-[#522D60]/10">
                <span>Müdahale Aracı:</span>
                <strong className="text-[#522D60] font-mono">{toolName}</strong>
              </div>
              <div className="flex justify-between items-center py-0.5 border-b border-[#522D60]/10">
                <span>Hedef Servis:</span>
                <strong className="text-[#522D60]">{incident.service?.name}</strong>
              </div>
              <div className="flex justify-between items-center py-0.5 border-b border-[#522D60]/10">
                <span>Risk Seviyesi:</span>
                <strong
                  className={`font-bold ${
                    riskLevel === "high"
                      ? "text-[#D9383A]"
                      : riskLevel === "medium"
                      ? "text-[#F2A67B]"
                      : "text-[#1E8E5A]"
                  }`}
                >
                  {riskLevel === "high" ? "YÜKSEK" : riskLevel === "medium" ? "ORTA" : "DÜŞÜK"}
                </strong>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span>Tahmini Süre:</span>
                <strong className="text-[#522D60]">
                  {payload.estimated_duration || (isSev3 ? "< 5 sn" : "~10-15 sn")}
                </strong>
              </div>
            </div>

            {/* State-specific Actions */}
            {isExecuted ? (
              <div className="space-y-2">
                <div className="p-2.5 bg-[#EEFBF3] border-[1.5px] border-[#1E8E5A] text-center font-bold text-[11px] text-[#1E8E5A]">
                  {actionStatus === "autonomous_executed"
                    ? "✓ AJAN TARAFINDAN OTONOM İCRA EDİLDİ"
                    : `✓ ${payload.approved_by || "MÜHENDİS"} ONAYIYLA UYGULANDI`}
                </div>
                {terminalOutput && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowTerminal(!showTerminal)}
                      className="text-[9px] text-[#80426E] underline hover:text-[#522D60] cursor-pointer"
                    >
                      {showTerminal ? "▼ Terminal Çıktısını Gizle" : "▶ Terminal Çıktısını Göster"}
                    </button>
                    {showTerminal && (
                      <pre className="mt-1 p-2 bg-[#1A1024] text-[#8DFFA9] border border-[#522D60] text-[9px] font-mono overflow-x-auto max-h-36 leading-tight whitespace-pre-wrap">
                        {terminalOutput}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ) : isRejected ? (
              <div className="p-2.5 bg-[#FAF6F2] border-[1.5px] border-[#80426E] text-center text-[10px] text-[#80426E] font-bold">
                ✕ PLAN REDDEDİLDİ — Manuel komut bekleniyor
              </div>
            ) : isSev1 ? (
              <div className="p-2.5 bg-[#FDF2F2] border-[1.5px] border-[#D9383A] text-[10px] text-[#D9383A] space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <span>🔒</span> TEK TIK ONAY KİLİTLİ (SEV-1)
                </div>
                <p className="text-[9px] leading-tight text-[#522D60]/90">
                  Guardrail Engine kuralı gereğince kritik kesintide hazır şablon çalıştırılamaz. Alt komut çubuğundan adım adım talimat verilmelidir.
                </p>
              </div>
            ) : (
              /* SEV-2 Action Buttons */
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={loadingAction !== null}
                  className={`w-full py-2.5 px-3 bg-[#F2A67B] hover:bg-[#FFD38B] text-[#522D60] border-[1.5px] border-[#522D60] font-mono font-bold text-xs os-btn-shadow os-active-press transition-none cursor-pointer flex items-center justify-center gap-1.5 ${
                    loadingAction === "approve" ? "opacity-75 cursor-wait" : ""
                  }`}
                >
                  <span>{loadingAction === "approve" ? "⏳" : "⚡"}</span>
                  <span>
                    {loadingAction === "approve" ? "[ PLAN UYGULANIYOR... ]" : "[ ONAYLA VE UYGULA ]"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleReject}
                  disabled={loadingAction !== null}
                  className="w-full py-1 px-2 bg-[#FFFFFF] hover:bg-[#FAF6F2] text-[#80426E] border border-[#522D60]/40 font-mono text-[10px] font-bold cursor-pointer transition-none"
                >
                  {loadingAction === "reject" ? "Reddediliyor..." : "[ REDDET / MANUEL MÜDAHALE ]"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
