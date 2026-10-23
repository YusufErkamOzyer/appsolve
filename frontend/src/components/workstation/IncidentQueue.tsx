"use client";

import React, { useState } from "react";
import { Incident } from "@/lib/api";
import { OsWindow } from "../os/OsWindow";
import { OsBadge } from "../os/OsBadge";
import { SlaCountdown } from "./SlaCountdown";

interface IncidentQueueProps {
  incidents: Incident[];
  selectedIncidentId: number | null;
  onSelectIncident: (incident: Incident) => void;
  onOpenSimulator?: () => void;
}

export function IncidentQueue({
  incidents,
  selectedIncidentId,
  onSelectIncident,
  onOpenSimulator,
}: IncidentQueueProps) {
  const [filter, setFilter] = useState<"active" | "all" | "resolved">("active");

  const activeIncidents = incidents.filter((i) => i.status !== "resolved");
  const resolvedIncidents = incidents.filter((i) => i.status === "resolved");

  const filteredIncidents =
    filter === "active"
      ? activeIncidents
      : filter === "resolved"
      ? resolvedIncidents
      : incidents;

  return (
    <OsWindow
      title="INCIDENT_QUEUE"
      version="1.1"
      variant="ink"
      headerRight={
        <span>
          AKTİF: {activeIncidents.length} / {incidents.length}
        </span>
      }
      contentClassName="p-0 flex flex-col h-full min-h-[560px]"
    >
      {/* Queue Filter Tabs */}
      <div className="border-b-[1.5px] border-[#522D60] bg-[#FAF6F2] p-1.5 flex gap-1 font-mono text-[10px] select-none">
        <button
          type="button"
          onClick={() => setFilter("active")}
          className={`flex-1 py-1 text-center border cursor-pointer transition-none ${
            filter === "active"
              ? "bg-[#522D60] text-[#FFFFFF] border-[#522D60] font-bold"
              : "bg-[#FFFFFF] text-[#522D60] border-[#522D60]/30 hover:bg-[#FAF6F2]"
          }`}
        >
          AKTİF ({activeIncidents.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`flex-1 py-1 text-center border cursor-pointer transition-none ${
            filter === "all"
              ? "bg-[#522D60] text-[#FFFFFF] border-[#522D60] font-bold"
              : "bg-[#FFFFFF] text-[#522D60] border-[#522D60]/30 hover:bg-[#FAF6F2]"
          }`}
        >
          TÜMÜ ({incidents.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("resolved")}
          className={`flex-1 py-1 text-center border cursor-pointer transition-none ${
            filter === "resolved"
              ? "bg-[#522D60] text-[#FFFFFF] border-[#522D60] font-bold"
              : "bg-[#FFFFFF] text-[#522D60] border-[#522D60]/30 hover:bg-[#FAF6F2]"
          }`}
        >
          ÇÖZÜLEN ({resolvedIncidents.length})
        </button>
      </div>

      {/* Incident List */}
      <div className="divide-y-[1.5px] divide-[#522D60] overflow-y-auto flex-1 max-h-[600px]">
        {filteredIncidents.length === 0 ? (
          <div className="p-6 text-center space-y-3 font-mono text-xs">
            <div className="text-[#522D60] font-bold">
              {incidents.length === 0
                ? "[TELEMETRİ DİNLENİYOR]"
                : "[KAYIT BULUNAMADI]"}
            </div>
            <p className="text-[11px] font-sans text-[#80426E] max-w-xs mx-auto">
              {incidents.length === 0
                ? "Henüz bir hata sinyali yakalanmadı. QuickCart mobil uygulamasından veya simülatörden sinyal gönderildiğinde anında burada listelenecektir."
                : "Seçilen filtre ölçütlerine uyan bir olay bulunmuyor."}
            </p>
            {onOpenSimulator && incidents.length === 0 && (
              <button
                type="button"
                onClick={onOpenSimulator}
                className="px-3 py-1 bg-[#F2A67B] text-[#522D60] border-[1.5px] border-[#522D60] font-mono text-[10px] font-bold os-btn-shadow cursor-pointer"
              >
                ⚡ TEST SİNYALİ GÖNDER
              </button>
            )}
          </div>
        ) : (
          filteredIncidents.map((inc) => {
            const isSelected = inc.id === selectedIncidentId;
            const isSev1 = inc.severity === "SEV-1";
            const isSev2 = inc.severity === "SEV-2";
            const isResolved = inc.status === "resolved";

            return (
              <button
                key={inc.id}
                type="button"
                onClick={() => onSelectIncident(inc)}
                className={`w-full text-left p-2.5 transition-none cursor-pointer block select-none border-l-4 ${
                  isSelected
                    ? isSev1
                      ? "border-l-[#D9383A] bg-[#FAF6F2] os-btn-shadow-sm"
                      : "border-l-[#F2A67B] bg-[#FAF6F2] os-btn-shadow-sm"
                    : "border-l-transparent hover:bg-[#FAF6F2]/60"
                }`}
              >
                {/* Row Header: Code, Service, Badges */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1">
                  <div className="flex items-center gap-1.5 font-mono text-[11px]">
                    <span className="font-bold text-[#522D60]">
                      {isSelected ? "> " : ""}
                      {inc.incident_code}
                    </span>
                    <span className="text-[#80426E] text-[10px]">
                      [{inc.service?.name || "Servis"}]
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {inc.severity ? (
                      <OsBadge
                        variant={
                          isSev1 ? "sev1" : isSev2 ? "sev2" : "sev3"
                        }
                      >
                        {inc.severity}
                      </OsBadge>
                    ) : (
                      <OsBadge variant="amber">ANALİZ</OsBadge>
                    )}

                    {isResolved ? (
                      <span className="px-1 py-0.2 border border-[#1E8E5A] bg-[#1E8E5A] text-[#FFFFFF] font-mono text-[9px] font-bold">
                        ÇÖZÜLDÜ
                      </span>
                    ) : inc.autonomy_mode === "manual_command_only" ? (
                      <span className="px-1 py-0.2 border border-[#D9383A] bg-[#FFFFFF] text-[#D9383A] font-mono text-[9px] font-bold">
                        KİLİT
                      </span>
                    ) : inc.autonomy_mode === "approval_required" ? (
                      <span className="px-1 py-0.2 border border-[#F2A67B] bg-[#FFFFFF] text-[#522D60] font-mono text-[9px] font-bold">
                        ONAY
                      </span>
                    ) : (
                      <span className="px-1 py-0.2 border border-[#FFD38B] bg-[#FFFFFF] text-[#522D60] font-mono text-[9px]">
                        OTONOM
                      </span>
                    )}
                  </div>
                </div>

                {/* Title */}
                <div className="font-mono text-[11px] font-semibold text-[#522D60] line-clamp-2 leading-tight">
                  {inc.title}
                </div>

                {/* Footer: Timestamp & SLA */}
                <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-[#80426E]">
                  <span>
                    {new Date(inc.created_at).toLocaleTimeString()}
                  </span>

                  {!isResolved && inc.sla_deadline && (
                    <SlaCountdown
                      deadline={inc.sla_deadline}
                      compact
                      className={isSev1 ? "text-[#D9383A]" : "text-[#522D60]"}
                    />
                  )}

                  {isResolved && (
                    <span className="text-[#1E8E5A] font-bold">
                      ● KAPANDI
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </OsWindow>
  );
}
