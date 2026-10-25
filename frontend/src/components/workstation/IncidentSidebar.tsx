"use client";

import React, { useState, useMemo } from "react";
import { Incident } from "@/lib/api";

interface IncidentSidebarProps {
  incidents: Incident[];
  selectedIncidentId: number | null;
  onSelectIncident: (incident: Incident) => void;
  onOpenSimulator?: () => void;
  className?: string;
}

export function IncidentSidebar({
  incidents,
  selectedIncidentId,
  onSelectIncident,
  onOpenSimulator,
  className = "",
}: IncidentSidebarProps) {
  const [sevFilter, setSevFilter] = useState<"all" | "SEV-1" | "SEV-2" | "SEV-3">("all");

  const counts = useMemo(() => {
    return {
      all: incidents.length,
      sev1: incidents.filter((i) => i.severity === "SEV-1").length,
      sev2: incidents.filter((i) => i.severity === "SEV-2").length,
      sev3: incidents.filter((i) => i.severity === "SEV-3").length,
    };
  }, [incidents]);

  const filteredIncidents = useMemo(() => {
    if (sevFilter === "all") return incidents;
    return incidents.filter((i) => i.severity === sevFilter);
  }, [incidents, sevFilter]);

  const [mountedNow, setMountedNow] = useState<number | null>(null);

  React.useEffect(() => {
    const tick = () => setMountedNow(Date.now());
    const initialTimer = setTimeout(tick, 0);
    const interval = setInterval(tick, 30000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, []);

  const formatRelativeTime = (isoString: string) => {
    const d = new Date(isoString);
    if (!mountedNow) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    const diffMs = mountedNow - d.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return "Az önce";
    if (diffMins < 60) return `${diffMins} dk önce`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours} sa önce`;
  };

  return (
    <div
      className={`border-[1.5px] border-[#522D60] bg-[#FFFFFF] os-window-shadow flex flex-col min-h-[240px] select-none ${
        className || "w-full lg:w-[350px] xl:w-[380px] shrink-0 h-full lg:max-h-[calc(100vh-80px)]"
      }`}
    >
      {/* 1. Header Bar */}
      <div className="h-9 px-3 border-b-[1.5px] border-[#522D60] bg-[#FFFFFF] flex items-center justify-between font-mono text-[11px]">
        <div className="flex items-center gap-2 font-bold text-[#522D60]">
          <span className="text-xs">☰</span>
          <span className="tracking-wider">OLAY KUYRUĞU</span>
        </div>
        <span className="px-1.5 py-0.2 bg-[#FAF6F2] border border-[#522D60] font-bold text-[#522D60] text-[10px]">
          {incidents.filter((i) => i.status !== "resolved").length} Aktif / {incidents.length} Toplam
        </span>
      </div>

      {/* 2. Severity Segmented Control Tabs */}
      <div className="p-2 border-b-[1.5px] border-[#522D60] bg-[#FAF6F2] grid grid-cols-4 gap-1 font-mono text-[10px]">
        <button
          type="button"
          onClick={() => setSevFilter("all")}
          className={`py-1 text-center border cursor-pointer transition-none ${
            sevFilter === "all"
              ? "bg-[#FFD38B] text-[#522D60] border-[#522D60] font-bold shadow-xs"
              : "bg-[#FFFFFF] text-[#522D60] border-[#522D60]/30 hover:bg-[#FAF6F2]"
          }`}
        >
          TÜMÜ ({counts.all})
        </button>
        <button
          type="button"
          onClick={() => setSevFilter("SEV-1")}
          className={`py-1 text-center border cursor-pointer transition-none ${
            sevFilter === "SEV-1"
              ? "bg-[#D9383A] text-[#FFFFFF] border-[#522D60] font-bold"
              : "bg-[#FFFFFF] text-[#522D60] border-[#522D60]/30 hover:bg-[#FAF6F2]"
          }`}
        >
          SEV-1 ({counts.sev1})
        </button>
        <button
          type="button"
          onClick={() => setSevFilter("SEV-2")}
          className={`py-1 text-center border cursor-pointer transition-none ${
            sevFilter === "SEV-2"
              ? "bg-[#F2A67B] text-[#522D60] border-[#522D60] font-bold"
              : "bg-[#FFFFFF] text-[#522D60] border-[#522D60]/30 hover:bg-[#FAF6F2]"
          }`}
        >
          SEV-2 ({counts.sev2})
        </button>
        <button
          type="button"
          onClick={() => setSevFilter("SEV-3")}
          className={`py-1 text-center border cursor-pointer transition-none ${
            sevFilter === "SEV-3"
              ? "bg-[#FFD38B] text-[#522D60] border-[#522D60] font-bold"
              : "bg-[#FFFFFF] text-[#522D60] border-[#522D60]/30 hover:bg-[#FAF6F2]"
          }`}
        >
          SEV-3 ({counts.sev3})
        </button>
      </div>

      {/* 3. Incidents List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#522D60]/15 p-2 space-y-1.5">
        {filteredIncidents.length === 0 ? (
          <div className="p-8 text-center space-y-2 font-mono text-xs text-[#522D60]">
            <div className="font-bold">[OLAY BULUNAMADI]</div>
            <p className="text-[11px] font-sans text-[#80426E]">
              {incidents.length === 0
                ? "Henüz kaydedilmiş bir hata sinyali yok. Sağ üstteki [SİNYAL SİMÜLATÖRÜ] ile test sinyali gönderebilirsiniz."
                : "Bu filtreye ait olay bulunmuyor."}
            </p>
            {onOpenSimulator && incidents.length === 0 && (
              <button
                type="button"
                onClick={onOpenSimulator}
                className="mt-2 px-3 py-1 bg-[#F2A67B] text-[#522D60] border border-[#522D60] font-mono text-[10px] font-bold cursor-pointer"
              >
                + SİNYAL GÖNDER
              </button>
            )}
          </div>
        ) : (
          filteredIncidents.map((inc) => {
            const isSelected = inc.id === selectedIncidentId;
            const isUncategorized = !inc.severity || inc.ai_stage === "jev_categorizing";
            const isSev1 = inc.severity === "SEV-1";
            const isSev2 = inc.severity === "SEV-2";
            const isResolved = inc.status === "resolved";

            const dotColor = isResolved
              ? "bg-[#1E8E5A]"
              : isUncategorized
              ? "bg-[#F2A67B] animate-pulse"
              : isSev1
              ? "bg-[#D9383A]"
              : isSev2
              ? "bg-[#F2A67B]"
              : "bg-[#80426E]";

            const badgeBg = isUncategorized
              ? "bg-[#FFD38B] text-[#522D60] animate-pulse"
              : isSev1
              ? "bg-[#D9383A] text-[#FFFFFF]"
              : isSev2
              ? "bg-[#F2A67B] text-[#522D60]"
              : "bg-[#FFD38B] text-[#522D60]";

            return (
              <button
                key={inc.id}
                type="button"
                onClick={() => onSelectIncident(inc)}
                className={`w-full text-left p-2.5 transition-none cursor-pointer block select-none border ${
                  isSelected
                    ? "bg-[#FDF0EA] border-[#E06D53] shadow-xs"
                    : "bg-[#FFFFFF] border-transparent hover:bg-[#FAF6F2]"
                }`}
              >
                {/* Row 1: Dot + Code + Severity Badge + Status Tag + Timestamp */}
                <div className="flex items-center justify-between gap-1 mb-1 font-mono text-[10px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                    <span className="font-bold text-[#522D60] tracking-tight">
                      {inc.incident_code}
                    </span>
                    <span
                      className={`px-1.5 py-0.2 border border-[#522D60] font-bold text-[9px] uppercase ${badgeBg}`}
                    >
                      {isUncategorized ? "⏳ @SOLVER İNCELİYOR" : inc.severity}
                    </span>
                    {isResolved ? (
                      <span className="inline-flex items-center gap-1 text-[#1E8E5A] text-[9px] font-bold truncate">
                        <span>{inc.severity === "SEV-3" ? "· OTONOM" : "· ÇÖZÜLDÜ"}</span>
                        <span className="px-1 py-0.1 bg-[#EEFBF3] border border-[#1E8E5A] text-[#1E8E5A] text-[8px] font-mono">
                          📄 POST-MORTEM
                        </span>
                      </span>
                    ) : isUncategorized ? (
                      <span className="text-[#80426E] text-[9px] font-bold animate-pulse truncate">
                        · HAM
                      </span>
                    ) : isSev2 ? (
                      <span className="text-[#F2A67B] text-[9px] font-bold animate-pulse truncate">
                        · ONAY
                      </span>
                    ) : isSev1 ? (
                      <span className="text-[#D9383A] text-[9px] font-bold animate-pulse truncate">
                        · KRİZ
                      </span>
                    ) : null}
                  </div>

                  <span className="text-[#80426E] text-[10px] shrink-0">
                    {formatRelativeTime(inc.created_at)}
                  </span>
                </div>

                {/* Row 2: Title */}
                <div className="font-mono text-[12px] font-bold text-[#522D60] truncate leading-snug">
                  {inc.title}
                </div>

                {/* Row 3: Short Subtitle / Live AI Status Text / Reasoning */}
                <div className="text-[11px] font-sans truncate mt-0.5">
                  {inc.ai_status_text ? (
                    <span className="text-[#522D60] font-semibold flex items-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#F2A67B] animate-ping shrink-0" />
                      <span className="truncate">{inc.ai_status_text}</span>
                    </span>
                  ) : (
                    <span className="text-[#80426E]">
                      {inc.reasoning || `${inc.service?.name || "Servis"} telemetri sinyali inceleniyor.`}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
