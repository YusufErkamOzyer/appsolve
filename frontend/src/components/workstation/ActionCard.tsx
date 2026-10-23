"use client";

import React, { useState } from "react";
import { Incident, ActionCardPayload, WarRoomMessage, approveIncidentPlan, rejectIncidentPlan } from "@/lib/api";

interface ActionCardProps {
  incident: Incident;
  message?: WarRoomMessage;
  onActionComplete?: () => void;
  onRequestRevision?: (planId: string) => void;
}

export function ActionCard({
  incident,
  message,
  onActionComplete,
  onRequestRevision,
}: ActionCardProps) {
  const [loadingAction, setLoadingAction] = useState<"approve" | "reject" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState<boolean>(true);

  const plan = incident.recommended_action_plan;
  const isSev1 = incident.severity === "SEV-1";
  const isSev3 = incident.severity === "SEV-3";
  const isResolved = incident.status === "resolved";

  // Belirli bir mesaj verilmişse onu, verilmemişse War Room içindeki en son action_card'ı kullan
  const actionCardMsg = message || incident.messages?.filter((m) => m.message_type === "action_card").pop();
  const payload: ActionCardPayload = actionCardMsg?.action_card_payload || {};
  const actionStatus = actionCardMsg?.action_status || (isResolved && isSev3 ? "autonomous_executed" : isResolved ? "executed" : "pending");

  if (!plan && !actionCardMsg) {
    return null;
  }

  const planId = payload.plan_id || plan?.plan_id || "PLAN #01";
  const title = payload.title || plan?.title || "İmplementasyon Planı";
  const toolName = payload.tool_name || plan?.tool_name || "system_tool";
  const riskLevel = (payload.risk_level || plan?.risk_level || (isSev3 ? "low" : "high")).toLowerCase();
  const steps = payload.steps || plan?.steps || [];
  const terminalOutput = payload.terminal_output;

  const handleApprove = async () => {
    if (loadingAction || isResolved) return;
    setLoadingAction("approve");
    setActionError(null);
    try {
      await approveIncidentPlan(incident.id, "Nöbetçi Mühendis (On-Call SRE)", planId);
      if (onActionComplete) onActionComplete();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Plan onaylanırken hata oluştu.");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleReject = async () => {
    if (loadingAction || isResolved) return;
    if (!confirm(`'${planId}' implementasyon planını reddetmek istediğinize emin misiniz?`)) {
      return;
    }
    setLoadingAction("reject");
    setActionError(null);
    try {
      await rejectIncidentPlan(incident.id, "Nöbetçi Mühendis (On-Call SRE)", "Mühendis tarafından revizyon talep edildi.");
      if (onActionComplete) onActionComplete();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Plan reddedilirken hata oluştu.");
    } finally {
      setLoadingAction(null);
    }
  };

  const renderStatusBadge = () => {
    if (actionStatus === "autonomous_executed" || (isSev3 && isResolved)) {
      return (
        <span className="px-2 py-0.5 bg-[#1E8E5A] text-[#FFFFFF] font-mono text-[9px] font-bold border border-[#522D60] inline-flex items-center gap-1">
          <span>✓</span> OTONOM UYGULANDI
        </span>
      );
    }
    if (actionStatus === "executed" || isResolved) {
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
    return (
      <span className="px-2 py-0.5 bg-[#F2A67B] text-[#522D60] font-mono text-[9px] font-bold border border-[#522D60] animate-pulse">
        ● ONAY VE İCRA BEKLİYOR
      </span>
    );
  };

  const isExecuted = actionStatus === "executed" || actionStatus === "autonomous_executed" || (isResolved && terminalOutput);
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
              isExecuted ? "bg-[#1E8E5A]" : isSev1 ? "bg-[#D9383A]" : "bg-[#F2A67B]"
            }`}
          />
        </span>
        <span className="font-bold text-[#80426E] tabular-nums">
          {actionCardMsg ? new Date(actionCardMsg.created_at).toLocaleTimeString() : new Date(incident.created_at).toLocaleTimeString()}
        </span>
        <span className="px-1.5 py-0.2 bg-[#FAF6F2] border border-[#522D60] text-[#522D60] font-bold tracking-wider">
          İMPLEMENTASYON PLANI
        </span>
        <span className="text-[10px] text-[#80426E] font-bold">({planId})</span>
      </div>

      {/* Card Window Container */}
      <div
        className={`border-[1.5px] border-[#522D60] bg-[#FFFFFF] os-window-shadow transition-all ${
          isExecuted ? "bg-[#FAFDFB]" : isSev1 ? "bg-[#FFFDFC]" : "bg-[#FFFFFF]"
        }`}
      >
        {/* Header Bar */}
        <div className="h-8 px-3 border-b-[1.5px] border-[#522D60] bg-[#FAF6F2] flex items-center justify-between font-mono text-[10px]">
          <div className="flex items-center gap-1.5 font-bold text-[#522D60]">
            <span className="text-[#80426E]">◧</span>
            <span>{planId}: {title.toUpperCase()}</span>
          </div>
          {renderStatusBadge()}
        </div>

        {/* Content Body */}
        <div className="p-3.5 space-y-3 font-mono">
          {actionError && (
            <div className="p-2 border border-[#D9383A] bg-[#FDF2F2] text-[#D9383A] text-[10px]">
              [HATA] {actionError}
            </div>
          )}

          {/* Hypothesis / Goal */}
          <div className="space-y-1">
            <span className="text-[9px] text-[#80426E] uppercase font-bold block">
              AMAC VE KAPSAM:
            </span>
            <p className="font-sans text-[12px] text-[#522D60] leading-snug">
              {payload.hypothesis || incident.hypothesis || "Kriz durumu için sistem kurtarma prosedürü"}
            </p>
          </div>

          {/* Steps List */}
          <div className="space-y-1.5 bg-[#FAF6F2] p-2.5 border border-[#522D60]/20">
            <div className="flex items-center justify-between text-[9px] text-[#80426E] font-bold uppercase">
              <span>İMPLEMENTASYON ADIMLARI ({steps.length}):</span>
              <span className="text-[#522D60] font-mono">Araç: {toolName}</span>
            </div>

            <ol className="space-y-1 text-[11px] text-[#522D60]">
              {steps.map((step, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="font-bold text-[#80426E] shrink-0 font-mono">
                    [{idx + 1}]
                  </span>
                  <span className="font-sans text-[11px] leading-tight text-[#522D60]">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* Metadata Grid & Actions */}
          <div className="border-t border-[#522D60]/20 pt-2.5 space-y-2.5">
            <div className="grid grid-cols-2 text-[10px] text-[#80426E]">
              <div className="flex justify-between items-center py-0.5 pr-2 border-r border-[#522D60]/20">
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
              <div className="flex justify-between items-center py-0.5 pl-2">
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
                    ? "✓ @SOLVER TARAFINDAN OTONOM İCRA EDİLDİ"
                    : `✓ ${payload.approved_by || "MÜHENDİS"} ONAYIYLA BAŞARIYLA UYGULANDI`}
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
                ✕ PLAN REDDEDİLDİ — @solver'dan yeni talimatla revize plan istenebilir
              </div>
            ) : (
              /* Ready for One-Click Execution */
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
                    {loadingAction === "approve" ? "[ PLAN İCRA EDİLİYOR... ]" : `[ ⚡ ONAYLA VE ÇALIŞTIR (${planId}) ]`}
                  </span>
                </button>

                <div className="flex gap-2">
                  {onRequestRevision && (
                    <button
                      type="button"
                      onClick={() => onRequestRevision(planId)}
                      disabled={loadingAction !== null}
                      className="flex-1 py-1 px-2 bg-[#FAF6F2] hover:bg-[#FFFFFF] text-[#522D60] border border-[#522D60]/50 font-mono text-[10px] font-bold cursor-pointer transition-none"
                    >
                      [ 💬 @solver'dan Revize İste ]
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleReject}
                    disabled={loadingAction !== null}
                    className="py-1 px-3 bg-[#FFFFFF] hover:bg-[#FAF6F2] text-[#80426E] border border-[#522D60]/40 font-mono text-[10px] font-bold cursor-pointer transition-none"
                  >
                    {loadingAction === "reject" ? "Reddediliyor..." : "[ REDDET ]"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
