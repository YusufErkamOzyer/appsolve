"use client";

import React from "react";
import { Incident, Service } from "@/lib/api";
import { SlaCountdown } from "./SlaCountdown";
import { OsButton } from "../os/OsButton";

interface HeaderBarProps {
  activeIncidents: Incident[];
  selectedIncident: Incident | null;
  onSelectIncident: (incident: Incident) => void;
  services: Service[];
  onOpenSimulator?: () => void;
}

export function HeaderBar({
  activeIncidents,
  selectedIncident,
  onSelectIncident,
  services,
  onOpenSimulator,
}: HeaderBarProps) {
  // Determine highest priority active incident
  const activeSev1 = activeIncidents.find((i) => i.severity === "SEV-1");
  const activeSev2 = activeIncidents.find((i) => i.severity === "SEV-2");
  const activeSev3 = activeIncidents.find((i) => i.severity === "SEV-3");

  const isSev1Alarm = Boolean(activeSev1);
  const isSev2Alert = !isSev1Alarm && Boolean(activeSev2);
  const isSev3Auto = !isSev1Alarm && !isSev2Alert && Boolean(activeSev3);
  const isNominal = !isSev1Alarm && !isSev2Alert && !isSev3Auto;

  return (
    <div className="space-y-2">
      {/* 1. SEV-Sensitive Main Alert Strip */}
      <section
        className={`border-[2px] border-[#522D60] p-2.5 sm:px-3 sm:py-2 os-window-shadow flex flex-wrap items-center justify-between gap-2.5 transition-none select-none ${
          isSev1Alarm
            ? "bg-[#D9383A] text-[#FFFFFF]"
            : isSev2Alert
            ? "bg-[#F2A67B] text-[#522D60] font-bold"
            : isSev3Auto
            ? "bg-[#FFD38B] text-[#522D60]"
            : "bg-[#FFFFFF] text-[#522D60]"
        }`}
      >
        {/* Left Side: Alarm Headline & Context */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-3.5 h-3.5 shrink-0 border border-[#522D60] flex items-center justify-center font-mono text-[10px] leading-none ${
              isSev1Alarm
                ? "bg-[#FFFFFF] text-[#D9383A] font-bold animate-ping"
                : isSev2Alert
                ? "bg-[#522D60] text-[#F2A67B]"
                : isSev3Auto
                ? "bg-[#522D60] text-[#FFD38B]"
                : "bg-[#1E8E5A] text-[#FFFFFF]"
            }`}
          >
            {isSev1Alarm ? "!" : isSev2Alert ? "▲" : isSev3Auto ? "◆" : "●"}
          </span>

          <div className="font-mono text-xs tracking-wider min-w-0">
            {isSev1Alarm && activeSev1 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold underline decoration-2">
                  SEV-1 KRİTİK ALARM:
                </span>
                <span className="bg-[#522D60] text-[#FFFFFF] px-1.5 py-0.2 border border-[#FFFFFF]/40 font-bold">
                  {activeSev1.incident_code}
                </span>
                <span className="truncate max-w-[320px] sm:max-w-md opacity-95">
                  {activeSev1.title}
                </span>
              </div>
            )}

            {isSev2Alert && activeSev2 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">SEV-2 MAJÖR OLAY:</span>
                <span className="bg-[#522D60] text-[#FFFFFF] px-1.5 py-0.2 border border-[#522D60] font-bold">
                  {activeSev2.incident_code}
                </span>
                <span className="truncate max-w-[320px] sm:max-w-md">
                  {activeSev2.title}
                </span>
              </div>
            )}

            {isSev3Auto && activeSev3 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">SEV-3 OTONOM İŞLEM:</span>
                <span className="bg-[#522D60] text-[#FFFFFF] px-1.5 py-0.2 border border-[#522D60] font-bold">
                  {activeSev3.incident_code}
                </span>
                <span className="truncate max-w-[320px] sm:max-w-md">
                  {activeSev3.title}
                </span>
              </div>
            )}

            {isNominal && (
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#1E8E5A]">● NOMİNAL DURUM:</span>
                <span>TÜM SİSTEMLER OPERASYONEL — AKTİF KRİZ YOK</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Autonomy Lock, Escalation & Live SLA */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 font-mono text-[11px] shrink-0">
          {/* Autonomy Lock Badge */}
          <div className="border border-current px-2 py-0.5 bg-black/10">
            <span className="opacity-80 text-[10px]">KİLİT: </span>
            <span className="font-bold">
              {isSev1Alarm
                ? "TAM GÜVENLİK (MANUEL KOMUT)"
                : isSev2Alert
                ? "İNSAN ONAYI ŞARTI"
                : isSev3Auto
                ? "TAM OTONOMİ"
                : "GUARDRAILS AKTİF"}
            </span>
          </div>

          {/* Escalation Tag */}
          <div className="hidden md:inline-block border border-current px-2 py-0.5 bg-black/10">
            <span className="opacity-80 text-[10px]">ESKALASYON: </span>
            <span className="font-bold">
              {isSev1Alarm
                ? "ON-CALL + TAKIM LİDERİ"
                : isSev2Alert
                ? "NÖBETÇİ MÜHENDİS"
                : isSev3Auto
                ? "SESSİZ MOD"
                : "BEKLEMEDE"}
            </span>
          </div>

          {/* Live SLA Countdown */}
          {isSev1Alarm && activeSev1?.sla_deadline && (
            <div className="flex items-center gap-1.5">
              <SlaCountdown
                deadline={activeSev1.sla_deadline}
                resolvedAt={activeSev1.resolved_at}
              />
              {selectedIncident?.id !== activeSev1.id && (
                <button
                  type="button"
                  onClick={() => onSelectIncident(activeSev1)}
                  className="bg-[#FFFFFF] text-[#D9383A] hover:bg-[#FAF6F2] px-2 py-0.5 border border-[#522D60] font-bold text-[10px] cursor-pointer"
                  title="Kritik SEV-1 olayına odaklan"
                >
                  KRİZE GİT ➔
                </button>
              )}
            </div>
          )}

          {isSev2Alert && activeSev2?.sla_deadline && (
            <div className="flex items-center gap-1.5">
              <SlaCountdown
                deadline={activeSev2.sla_deadline}
                resolvedAt={activeSev2.resolved_at}
              />
              {selectedIncident?.id !== activeSev2.id && (
                <button
                  type="button"
                  onClick={() => onSelectIncident(activeSev2)}
                  className="bg-[#FFFFFF] text-[#522D60] hover:bg-[#FAF6F2] px-2 py-0.5 border border-[#522D60] font-bold text-[10px] cursor-pointer"
                >
                  ODAKLAN ➔
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 2. Microservices Telemetry Strip & Quick Actions */}
      <div className="border-[1.5px] border-[#522D60] bg-[#FAF6F2] px-2.5 py-1.5 os-window-shadow flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-[#522D60] text-[10px] uppercase tracking-wider mr-1">
            QUICKCART SERVİSLERİ:
          </span>

          {services.map((svc) => {
            const isOp = svc.status === "operational";
            const isDegraded = svc.status === "degraded";

            const badgeBg = isOp
              ? "bg-[#FFFFFF] text-[#1E8E5A] border-[#1E8E5A]"
              : isDegraded
              ? "bg-[#FFD38B] text-[#522D60] border-[#522D60] font-bold"
              : "bg-[#D9383A] text-[#FFFFFF] border-[#522D60] font-bold animate-pulse";

            return (
              <div
                key={svc.slug}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 border text-[10px] select-none ${badgeBg}`}
                title={`${svc.name} (${svc.name_en}) - Uptime: ${svc.uptime_percentage}%`}
              >
                <span className="w-1.5 h-1.5 bg-current shrink-0" />
                <span>{svc.name.toUpperCase()}:</span>
                <span>{svc.status_label}</span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {onOpenSimulator && (
            <OsButton
              variant="apricot"
              size="sm"
              onClick={onOpenSimulator}
              title="Harici QuickCart hata sinyali simüle et"
            >
              ⚡ SİNYAL SİMÜLATÖRÜ
            </OsButton>
          )}
        </div>
      </div>
    </div>
  );
}
