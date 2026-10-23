"use client";

import React from "react";
import { Incident, IncidentEvent } from "@/lib/api";
import { OsWindow } from "../os/OsWindow";

interface IncidentTimelineProps {
  incident: Incident | null;
}

export function IncidentTimeline({ incident }: IncidentTimelineProps) {
  if (!incident) {
    return (
      <OsWindow
        title="INCIDENT_TIMELINE"
        version="1.1"
        variant="ink"
        headerRight={<span>BEKLEMEDE</span>}
      >
        <div className="py-8 text-center font-mono text-xs text-[#80426E]">
          Zaman çizelgesi için sol kuyruktan bir olay seçin.
        </div>
      </OsWindow>
    );
  }

  const events = incident.events || [];
  const startTimeMs = events.length > 0
    ? new Date(events[0].occurred_at).getTime()
    : new Date(incident.created_at).getTime();

  // Lifecycle stage checks
  const hasSignal = events.some((e) => e.event_type === "signal_received");
  const hasTriage = events.some((e) => e.event_type === "ai_triage_completed");
  const hasEscalation = events.some((e) => e.event_type === "escalation_triggered");
  const isResolved = incident.status === "resolved";

  const stages = [
    { label: "1. SİNYAL", done: hasSignal, current: hasSignal && !hasTriage },
    { label: "2. TRIAGE", done: hasTriage, current: hasTriage && !hasEscalation },
    { label: "3. ESKALASYON", done: hasEscalation, current: hasEscalation && !isResolved },
    { label: "4. MÜDAHALE", done: isResolved, current: hasEscalation && !isResolved },
    { label: "5. ÇÖZÜM", done: isResolved, current: isResolved },
  ];

  return (
    <OsWindow
      title="INCIDENT_TIMELINE"
      version="1.1"
      variant="ink"
      headerRight={<span>{events.length} ADIM KAYDEDİLDİ</span>}
      contentClassName="p-0 flex flex-col"
    >
      {/* 1. 5-Stage Lifecycle Progress Strip */}
      <div className="border-b-[1.5px] border-[#522D60] bg-[#FAF6F2] p-1.5 grid grid-cols-5 gap-1 font-mono text-[9px] select-none text-center">
        {stages.map((stg) => (
          <div
            key={stg.label}
            className={`py-1 px-0.5 border ${
              stg.done
                ? "bg-[#522D60] text-[#FFFFFF] border-[#522D60] font-bold"
                : stg.current
                ? "bg-[#FFD38B] text-[#522D60] border-[#522D60] font-bold animate-pulse"
                : "bg-[#FFFFFF] text-[#80426E]/60 border-[#522D60]/20"
            }`}
          >
            {stg.label}
          </div>
        ))}
      </div>

      {/* 2. Chronological Vertical Event Stream */}
      <div className="p-3 divide-y divide-dashed divide-[#522D60]/30 max-h-[360px] overflow-y-auto space-y-2">
        {events.length === 0 ? (
          <div className="text-center py-4 font-mono text-xs text-[#80426E]">
            Henüz kaydedilmiş bir zaman çizelgesi adımı bulunmuyor.
          </div>
        ) : (
          events.map((ev: IncidentEvent, idx: number) => {
            const evTimeMs = new Date(ev.occurred_at).getTime();
            const diffSeconds = ((evTimeMs - startTimeMs) / 1000).toFixed(1);
            const deltaStr = idx === 0 ? "T0 (+0.0s)" : `+${diffSeconds}s`;

            const isTriage = ev.event_type === "ai_triage_completed";
            const isGuardrail = ev.event_type.includes("guardrail");
            const isEscalation = ev.event_type === "escalation_triggered";
            const isResolvedEvent = ev.event_type.includes("resolved");

            const actorTag = isTriage
              ? "GEMINI AI"
              : isGuardrail
              ? "GUARDRAIL"
              : isEscalation
              ? "ESKALASYON"
              : isResolvedEvent
              ? "ÇÖZÜM"
              : "TELEMETRİ";

            const actorBg = isTriage
              ? "bg-[#FFD38B] text-[#522D60]"
              : isGuardrail
              ? "bg-[#522D60] text-[#FFFFFF]"
              : isEscalation
              ? "bg-[#F2A67B] text-[#522D60]"
              : isResolvedEvent
              ? "bg-[#1E8E5A] text-[#FFFFFF]"
              : "bg-[#FAF6F2] text-[#522D60]";

            return (
              <div key={ev.id} className="pt-2 first:pt-0 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-1 font-mono text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-[#522D60] shrink-0" />
                    <span
                      className={`px-1 py-0.2 border border-[#522D60] font-bold text-[9px] ${actorBg}`}
                    >
                      [{actorTag}]
                    </span>
                    <span className="font-bold text-[#522D60] truncate max-w-[220px]">
                      {ev.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[#80426E] tabular-nums">
                    <span className="font-bold bg-[#FAF6F2] px-1 border border-[#522D60]/20">
                      {deltaStr}
                    </span>
                    <span>{new Date(ev.occurred_at).toLocaleTimeString()}</span>
                  </div>
                </div>

                {ev.details && (
                  <p className="font-sans text-[11px] text-[#522D60]/90 leading-tight pl-3 border-l-2 border-[#522D60]/30">
                    {ev.details}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </OsWindow>
  );
}
