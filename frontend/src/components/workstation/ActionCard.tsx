"use client";

import React, { useState } from "react";
import {
  Incident,
  ActionCardPayload,
  WarRoomMessage,
  approveIncidentPlan,
  rejectIncidentPlan,
} from "@/lib/api";
import { UnifiedDiffViewer } from "./UnifiedDiffViewer";

interface ActionCardProps {
  incident: Incident;
  message?: WarRoomMessage;
  onActionComplete?: () => void;
}

export function ActionCard({
  incident,
  message,
  onActionComplete,
}: ActionCardProps) {
  const [loadingAction, setLoadingAction] = useState<"approve" | "reject" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState<boolean>(true);

  const plan = incident.recommended_action_plan;
  const isSev1 = incident.severity === "SEV-1";
  const isSev3 = incident.severity === "SEV-3";
  const isResolved = incident.status === "resolved";

  // Belirli bir mesaj verilmişse onu, verilmemişse War Room içindeki en son action_card'ı kullan
  const actionCardMsg =
    message || incident.messages?.filter((m) => m.message_type === "action_card").pop();
  const payload: ActionCardPayload = actionCardMsg?.action_card_payload || {};
  const actionStatus =
    actionCardMsg?.action_status ||
    (isResolved && isSev3
      ? "autonomous_executed"
      : isResolved
      ? "executed"
      : "pending");

  if (!plan && !actionCardMsg) {
    return null;
  }

  const planId = payload.plan_id || plan?.plan_id || "PLAN #01";
  const title = payload.title || plan?.title || "İmplementasyon Planı";
  const toolName = payload.tool_name || plan?.tool_name || "system_tool";
  const riskLevel = (
    payload.risk_level ||
    plan?.risk_level ||
    (isSev3 ? "low" : "high")
  ).toLowerCase();
  const steps = payload.steps || plan?.steps || [];
  const terminalOutput = payload.terminal_output;

  const hasGithubInfo = Boolean(
    payload.github_branch ||
      payload.github_pr_number ||
      payload.github_pr_url ||
      payload.affected_file ||
      payload.diff_content
  );
  const hasPr = Boolean(
    payload.github_pr_number || payload.github_pr_url || payload.github_branch
  );
  const isExecuted =
    actionStatus === "executed" ||
    actionStatus === "autonomous_executed" ||
    actionStatus === "plan_approved" ||
    (isResolved && terminalOutput);
  const isRejected = actionStatus === "rejected";
  const isMerged = payload.merge_status === "merged" || (hasPr && (isExecuted && actionStatus !== "plan_approved"));
  const isPrPending = hasPr && !isMerged && !isRejected && !isExecuted;

  const isDeadlockTool =
    isSev1 ||
    toolName === "kill_db_locks" ||
    toolName === "kill_db_locks_and_failover" ||
    toolName === "inspect_db_locks" ||
    Boolean(payload.sre_bridge_output && payload.sre_bridge_output.includes("lock"));

  const handleApprove = async () => {
    if (loadingAction || isResolved) return;
    setLoadingAction("approve");
    setActionError(null);
    try {
      await approveIncidentPlan(
        incident.id,
        "Nöbetçi Mühendis (On-Call SRE)",
        planId,
        actionCardMsg?.id
      );
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
      await rejectIncidentPlan(
        incident.id,
        "Nöbetçi Mühendis (On-Call SRE)",
        "Mühendis tarafından revizyon talep edildi."
      );
      if (onActionComplete) onActionComplete();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Plan reddedilirken hata oluştu.");
    } finally {
      setLoadingAction(null);
    }
  };

  const renderStatusBadge = () => {
    if (hasPr && (isMerged || isExecuted) && actionStatus !== "plan_approved") {
      return (
        <span className="px-2 py-0.5 bg-[#1E8E5A] text-[#FFFFFF] font-mono text-[9px] font-bold border border-[#522D60] inline-flex items-center gap-1">
          <span>✓</span> PR BİRLEŞTİRİLDİ
        </span>
      );
    }
    if (actionStatus === "plan_approved") {
      return (
        <span className="px-2 py-0.5 bg-[#1E8E5A] text-[#FFFFFF] font-mono text-[9px] font-bold border border-[#522D60] inline-flex items-center gap-1">
          <span>✓</span> PLAN ONAYLANDI (PR HAZIRLANDI)
        </span>
      );
    }
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
    if (isPrPending) {
      return (
        <span className="px-2 py-0.5 bg-[#F2A67B] text-[#522D60] font-mono text-[9px] font-bold border border-[#522D60] animate-pulse">
          ● PR BİRLEŞTİRME BEKLİYOR
        </span>
      );
    }
    if (incident.severity === "SEV-2" || payload.plan_stage === "plan_proposal") {
      return (
        <span className="px-2 py-0.5 bg-[#F2A67B] text-[#522D60] font-mono text-[9px] font-bold border border-[#522D60] animate-pulse">
          ● İMPLEMENTASYON PLANI ONAYI BEKLİYOR
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 bg-[#F2A67B] text-[#522D60] font-mono text-[9px] font-bold border border-[#522D60] animate-pulse">
        ● ONAY VE İCRA BEKLİYOR
      </span>
    );
  };

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
          {actionCardMsg
            ? new Date(actionCardMsg.created_at).toLocaleTimeString()
            : new Date(incident.created_at).toLocaleTimeString()}
        </span>
        <span className="px-1.5 py-0.2 bg-[#FAF6F2] border border-[#522D60] text-[#522D60] font-bold tracking-wider">
          {hasPr ? "GITHUB AKSİYON KARTI" : "İMPLEMENTASYON PLANI"}
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
            <span>
              {planId}: {title.toUpperCase()}
            </span>
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

          {/* GitHub Remediation Metadata Banner */}
          {hasGithubInfo && (
            <div className="p-2.5 bg-[#FAF6F2] border border-[#522D60] space-y-2 os-btn-shadow-sm">
              <div className="flex items-center justify-between text-[9px] font-mono font-bold text-[#80426E] uppercase border-b border-[#522D60]/20 pb-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-[#522D60]">⑂</span>
                  <span>GİTHUB REMEDİATİON &amp; SRE KÖPRÜSÜ</span>
                </span>
                <span className="text-[#522D60] font-mono font-semibold">
                  {isMerged || isExecuted ? "KOD GÜNCELLENDİ ✓" : "YAMA İNCELEMESİ"}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Branch Pill */}
                {payload.github_branch && (
                  <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-[#FFFFFF] border border-[#522D60] text-[10px] font-mono">
                    <span className="text-[#80426E] font-bold"></span>
                    <span className="text-[#80426E]">Dal:</span>
                    {payload.github_branch_url ? (
                      <a
                        href={payload.github_branch_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-[#522D60] hover:underline inline-flex items-center gap-1"
                        title="GitHub dalını aç"
                      >
                        <span>{payload.github_branch}</span>
                        <span className="text-[9px]">↗</span>
                      </a>
                    ) : (
                      <span className="font-bold text-[#522D60]">{payload.github_branch}</span>
                    )}
                  </div>
                )}

                {/* PR Badge */}
                {(payload.github_pr_number || payload.github_pr_url) && (
                  <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-[#FFFFFF] border border-[#522D60] text-[10px] font-mono">
                    <span className="text-[#80426E] font-bold">⑂</span>
                    {payload.github_pr_url ? (
                      <a
                        href={payload.github_pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-[#522D60] hover:underline inline-flex items-center gap-1"
                        title="GitHub Pull Request sayfasını aç"
                      >
                        <span>PR #{payload.github_pr_number || "42"}</span>
                        <span className="text-[9px]">↗</span>
                      </a>
                    ) : (
                      <span className="font-bold text-[#522D60]">
                        PR #{payload.github_pr_number}
                      </span>
                    )}

                    {/* Status pill */}
                    <span
                      className={`px-1.5 py-0.2 text-[9px] font-bold border border-[#522D60] ${
                        isMerged || isExecuted
                          ? "bg-[#1E8E5A] text-[#FFFFFF]"
                          : "bg-[#F2A67B] text-[#522D60]"
                      }`}
                    >
                      {isMerged || isExecuted ? "MERGED ✓" : "OPEN ●"}
                    </span>
                  </div>
                )}

                {/* Affected file badge */}
                {payload.affected_file && (
                  <div className="inline-flex items-center gap-1 px-2 py-1 bg-[#FFFFFF] border border-[#522D60]/40 text-[10px] font-mono">
                    <span className="text-[#80426E]">📁 Dosya:</span>
                    <span className="font-bold text-[#522D60]">{payload.affected_file}</span>
                  </div>
                )}
              </div>

              {/* Embedded Unified Diff Viewer */}
              {payload.diff_content && (
                <div className="pt-1">
                  <UnifiedDiffViewer
                    diff={payload.diff_content}
                    filePath={payload.affected_file}
                    title="YAMA DÖKÜMÜ (UNIFIED DIFF)"
                  />
                </div>
              )}
            </div>
          )}

          {/* Hypothesis / Goal */}
          <div className="space-y-1">
            <span className="text-[9px] text-[#80426E] uppercase font-bold block">
              AMAÇ VE KAPSAM:
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

          {/* Live Diagnostic Terminal Feed View for SEV-1 Deadlock Outputs */}
          {isDeadlockTool && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[9px] font-mono text-[#80426E] font-bold uppercase">
                <span className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isExecuted ? "bg-[#1E8E5A]" : "bg-[#D9383A] animate-pulse"
                    }`}
                  />
                  <span>CANLI SİSTEM TANI VE KİLİT AKIŞI // SEV-1 DEADLOCK MONITOR</span>
                </span>
                <span className="text-[9px] px-1.5 py-0.2 bg-[#1A1024] text-[#8DFFA9] border border-[#522D60] font-mono">
                  {isExecuted ? "KİLİT ÇÖZÜLDÜ ✓" : "BLOKAJ TESPİT EDİLDİ ⚠"}
                </span>
              </div>

              <div className="border-[1.5px] border-[#522D60] bg-[#1A1024] p-3 space-y-2.5 font-mono text-[10px] os-window-shadow-sm">
                <div className="flex items-center justify-between border-b border-white/15 pb-1.5 text-[9px]">
                  <div className="flex items-center gap-2 text-[#8DFFA9]">
                    <span className="font-bold">&gt;_</span>
                    <span>POSTGRESQL LOCK REGISTRY &amp; SRE BRIDGE FEED</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-white/60">
                    <span>PORT: 4000</span>
                    <span>•</span>
                    <span className="text-[#FFD38B]">payment_records</span>
                  </div>
                </div>

                {/* Deadlock Tabular Lock Registry */}
                <div className="overflow-x-auto border border-white/10 bg-[#120B1A] p-2">
                  <div className="text-[9px] text-[#FFD38B] font-bold mb-1">
                    TRANSACTION KİLİT TABLOSU (LOCK REGISTRY):
                  </div>
                  <table className="w-full text-left font-mono text-[9px] text-white/80 border-collapse">
                    <thead>
                      <tr className="border-b border-white/20 text-[#8DFFA9]">
                        <th className="py-0.5 pr-2">PID</th>
                        <th className="py-0.5 pr-2">SÜRE</th>
                        <th className="py-0.5 pr-2">TABLO</th>
                        <th className="py-0.5 pr-2">KİLİT DURUMU</th>
                        <th className="py-0.5">BEKLEYEN İŞLEM / SORGU</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        className={`border-b border-white/10 ${
                          isExecuted
                            ? "text-white/50"
                            : "bg-[#D9383A]/20 text-[#FF9E9E] font-bold"
                        }`}
                      >
                        <td className="py-0.5 pr-2">4821</td>
                        <td className="py-0.5 pr-2">14.2s</td>
                        <td className="py-0.5 pr-2">payment_records</td>
                        <td className="py-0.5 pr-2 text-[#FF7070]">
                          {isExecuted
                            ? "SIGTERM İLE SONLANDIRILDI ✓"
                            : "EXCLUSIVE LOCK (HELD) ⚠"}
                        </td>
                        <td className="py-0.5 font-mono">
                          SELECT FOR UPDATE orders (qc_9941a87)
                        </td>
                      </tr>
                      <tr className="border-b border-white/5 text-white/70">
                        <td className="py-0.5 pr-2">4822</td>
                        <td className="py-0.5 pr-2">12.8s</td>
                        <td className="py-0.5 pr-2">payment_records</td>
                        <td className="py-0.5 pr-2 text-[#FFD38B]">
                          {isExecuted ? "SERBEST BIRAKILDI ✓" : "WAITING ON PID 4821"}
                        </td>
                        <td className="py-0.5 font-mono">
                          UPDATE orders SET status=&apos;paid&apos;
                        </td>
                      </tr>
                      <tr className="text-white/70">
                        <td className="py-0.5 pr-2">4823</td>
                        <td className="py-0.5 pr-2">11.4s</td>
                        <td className="py-0.5 pr-2">payment_records</td>
                        <td className="py-0.5 pr-2 text-[#FFD38B]">
                          {isExecuted ? "SERBEST BIRAKILDI ✓" : "WAITING ON PID 4821"}
                        </td>
                        <td className="py-0.5 font-mono">
                          UPDATE orders SET status=&apos;paid&apos;
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Raw Diagnostic Terminal Stream */}
                <pre className="text-[9px] font-mono text-[#8DFFA9] leading-tight overflow-x-auto max-h-36 whitespace-pre-wrap bg-[#0F0816] p-2 border border-white/10">
                  {terminalOutput ||
                    payload.sre_bridge_output ||
                    `[SRE-BRIDGE] Command: inspect_db_locks -> Target: checkout-prod-eu1 (payment_records)
[LOCK-DETECT] 48 transactions waiting on exclusive row-level lock (relation: payment_records).
[BLOCKER-PID] Transaction PID 4821 holds LockRows on 'order_uuid=qc_9941a87'; 47 downstream threads queueing.
[METRICS] In-flight transactions: 1,842 | Pool capacity: 98% exhausted | p99 latency: 14,200ms.`}
                </pre>

                {/* Blocker Action Quick Action Button */}
                {!isExecuted && !isRejected && (
                  <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                    <button
                      type="button"
                      onClick={handleApprove}
                      disabled={loadingAction !== null}
                      className="px-2.5 py-1 bg-[#D9383A] hover:bg-[#E5484A] text-[#FFFFFF] font-mono text-[9px] font-bold border border-white/30 cursor-pointer os-active-press transition-none"
                    >
                      [ ⚡ Blocker PID 4821 Sonlandır (SIGTERM) ]
                    </button>
                    <span className="text-[9px] text-white/50">
                      SRE Köprüsü aracılığıyla kilit temizleme ve bağlantı havuzu geri kazanımı
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

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
                {actionStatus === "plan_approved" ? (
                  <div className="p-2.5 bg-[#EEFBF3] border-[1.5px] border-[#1E8E5A] text-center font-bold text-[11px] text-[#1E8E5A] space-y-1">
                    <div className="flex items-center justify-center gap-1.5">
                      <span>✓</span>
                      <span>İMPLEMENTASYON PLANI ONAYLANDI</span>
                    </div>
                    <div className="text-[10px] font-mono text-[#1E8E5A]/90">
                      GitHub PR açıldı ve kod incelemeniz için yeni eylem kartı olarak eklendi.
                    </div>
                  </div>
                ) : hasPr ? (
                  <div className="p-2.5 bg-[#EEFBF3] border-[1.5px] border-[#1E8E5A] text-center font-bold text-[11px] text-[#1E8E5A] space-y-1">
                    <div className="flex items-center justify-center gap-1.5">
                      <span>✓</span>
                      <span>✓ PR BİRLEŞTİRİLDİ</span>
                    </div>
                    {payload.github_pr_number && (
                      <div className="text-[10px] font-mono text-[#1E8E5A]/90">
                        PR #{payload.github_pr_number} başarıyla main dalına birleştirildi ve QuickCart ortamına dağıtıldı.
                      </div>
                    )}
                    {payload.merge_commit_sha && (
                      <div className="text-[9px] font-mono text-[#522D60]">
                        Commit SHA:{" "}
                        <code className="bg-[#FFFFFF] px-1 py-0.5 border border-[#1E8E5A]/40 font-bold">
                          {payload.merge_commit_sha.slice(0, 10)}
                        </code>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-2.5 bg-[#EEFBF3] border-[1.5px] border-[#1E8E5A] text-center font-bold text-[11px] text-[#1E8E5A]">
                    {actionStatus === "autonomous_executed"
                      ? "✓ @SOLVER TARAFINDAN OTONOM İCRA EDİLDİ"
                      : `✓ ${payload.approved_by || "MÜHENDİS"} ONAYIYLA BAŞARIYLA UYGULANDI`}
                  </div>
                )}

                {terminalOutput && !isDeadlockTool && (
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
                ✕ PLAN REDDEDİLDİ — @solver&apos;dan yeni talimatla revize plan istenebilir
              </div>
            ) : (
              /* Ready for Approval */
              <div className="space-y-2">
                {isPrPending ? (
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
                      {loadingAction === "approve"
                        ? "[ PR BİRLEŞTİRİLİYOR VE DAĞITILIYOR... ]"
                        : "⚡ PR BİRLEŞTİR VE DAĞIT"}
                    </span>
                  </button>
                ) : (
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
                      {loadingAction === "approve"
                        ? "[ İŞLEM YÜRÜTÜLÜYOR... ]"
                        : incident.severity === "SEV-2" || payload.plan_stage === "plan_proposal"
                        ? `[ ⚡ PLANI ONAYLA VE PR HAZIRLA (${planId}) ]`
                        : `[ ⚡ PLANI ONAYLA VE UYGULA (${planId}) ]`}
                    </span>
                  </button>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleReject}
                    disabled={loadingAction !== null}
                    className="w-full py-1.5 px-3 bg-[#FFFFFF] hover:bg-[#FAF6F2] text-[#80426E] border border-[#522D60]/40 font-mono text-[10px] font-bold cursor-pointer transition-none"
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
