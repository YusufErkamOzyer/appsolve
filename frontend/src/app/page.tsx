"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { OsNavbar } from "@/components/os/OsNavbar";
import { IncidentSidebar } from "@/components/workstation/IncidentSidebar";
import { IncidentStream } from "@/components/workstation/IncidentStream";
import { RetroThinkingOrb } from "@/components/workstation/RetroThinkingOrb";
import { SignalSimulatorModal } from "@/components/workstation/SignalSimulatorModal";
import {
  fetchServices,
  fetchIncidents,
  Incident,
  ServicesResponse,
} from "@/lib/api";

export default function CommandWorkstationPage() {
  const [servicesData, setServicesData] = useState<ServicesResponse | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<number | null>(null);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Concurrency guard and newest incident tracker
  const isFetchingRef = useRef<boolean>(false);
  const lastTopIncidentIdRef = useRef<number | null>(null);

  const loadData = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const [sRes, iRes] = await Promise.all([fetchServices(), fetchIncidents()]);
      setServicesData(sRes);
      setIncidents(iRes.incidents);
      setError(null);

      const topIncident = iRes.incidents[0];

      // Auto-focus on new incident if a fresh one arrived from external signal or simulator
      if (topIncident) {
        if (lastTopIncidentIdRef.current === null) {
          // Initial load
          setSelectedIncidentId(topIncident.id);
          lastTopIncidentIdRef.current = topIncident.id;
        } else if (topIncident.id !== lastTopIncidentIdRef.current) {
          // A brand new incident was ingested!
          setSelectedIncidentId(topIncident.id);
          lastTopIncidentIdRef.current = topIncident.id;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "API bağlantı hatası");
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  const isAnyAiActive = useMemo(
    () =>
      incidents.some(
        (i) =>
          i.ai_stage &&
          i.ai_stage !== "completed" &&
          i.ai_stage !== "awaiting_approval"
      ),
    [incidents]
  );

  // Adaptive Visibility-Aware Reactive Polling Loop (750ms when AI stage is active, 1500ms idle)
  useEffect(() => {
    const runSync = async () => {
      await loadData();
    };

    void runSync();

    const pollIntervalMs = isAnyAiActive ? 750 : 1500;
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void runSync();
      }
    }, pollIntervalMs);

    const handleVisibilityOrFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void runSync();
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [loadData, isAnyAiActive]);

  const activeIncidents = useMemo(
    () => incidents.filter((i) => i.status !== "resolved"),
    [incidents]
  );

  const selectedIncident = useMemo(() => {
    if (!selectedIncidentId && incidents.length > 0) return incidents[0];
    return incidents.find((i) => i.id === selectedIncidentId) || incidents[0] || null;
  }, [selectedIncidentId, incidents]);

  const hasActiveSev1 = useMemo(
    () => activeIncidents.some((i) => i.severity === "SEV-1"),
    [activeIncidents]
  );

  // Sol Alt AI Loading Orb State Hesaplaması:
  const isSelectedAiActive = useMemo(() => {
    if (!selectedIncident) return false;
    const stage = selectedIncident.ai_stage;
    if (!stage) return selectedIncident.status === "investigating" && !selectedIncident.severity;
    return stage !== "completed" && stage !== "awaiting_approval";
  }, [selectedIncident]);

  const orbStatus = useMemo(() => {
    if (!selectedIncident) {
      return {
        isActive: false,
        stageLabel: "@SOLVER NÖBETTE",
        badgeText: "● HAZIR",
        statusText: "Sistem telemetrisi izleniyor — SRE ajanı hazırda bekliyor.",
      };
    }

    const stage = selectedIncident.ai_stage;
    const isResolved = selectedIncident.status === "resolved";

    if (isSelectedAiActive) {
      let label = "@SOLVER İŞLEMİ";
      if (
        stage === "jev_categorizing" ||
        (!selectedIncident.severity && selectedIncident.status === "investigating")
      ) {
        label = "@SOLVER ÖN ANALİZ";
      } else if (stage === "ai_analyzing") {
        label = "@SOLVER KÖK NEDEN ANALİZİ";
      } else if (stage === "ai_preparing_plan") {
        label = "@SOLVER PLAN HAZIRLIĞI";
      } else if (stage === "ai_inspecting_locks") {
        label = "@SOLVER KİLİT TARAMASI";
      } else if (stage === "ai_autonomous_solving") {
        label = "@SOLVER OTONOM MÜDAHALE";
      } else if (stage === "ai_preparing_patch") {
        label = "@SOLVER KOD ONARIM MOTORU";
      } else if (stage === "ai_executing_plan") {
        label = "@SOLVER İMPLEMENTASYON İCRASI";
      } else if (stage === "writing_post_mortem") {
        label = "@SOLVER RAPORLAMA MOTORU";
      }

      return {
        isActive: true,
        stageLabel: label,
        badgeText: "● İŞLENİYOR",
        statusText:
          selectedIncident.ai_status_text ||
          "@solver aktif telemetri ve sistem analizini yürütüyor...",
      };
    }

    // AI çalışmıyorken (durağan):
    if (isResolved) {
      return {
        isActive: false,
        stageLabel: "@SOLVER NÖBETTE",
        badgeText: "✓ ÇÖZÜLDÜ",
        statusText:
          "Olay kapatıldı ve Post-Mortem hazır — @solver yeni telemetri sinyali bekliyor.",
      };
    }

    if (stage === "awaiting_approval") {
      const hasPr = Boolean(
        selectedIncident.action_card?.github_pr_number ||
          selectedIncident.recommended_action_plan?.github_pr_number ||
          selectedIncident.messages?.some(
            (m) =>
              m.message_type === "action_card" &&
              m.action_card_payload?.github_pr_number
          )
      );
      return {
        isActive: false,
        stageLabel: "@SOLVER BEKLEMEDE",
        badgeText: "● ONAY BEKLİYOR",
        statusText: hasPr
          ? "Düzeltme PR'ı açıldı — Nöbetçi mühendisin birleştirme onayı bekleniyor."
          : "İmplementasyon planı hazırlandı — Nöbetçi mühendis onayı bekleniyor.",
      };
    }

    return {
      isActive: false,
      stageLabel: "@SOLVER BEKLEMEDE",
      badgeText: "● BEKLEMEDE",
      statusText:
        selectedIncident.ai_status_text ||
        "Sistem gözlem altında — @solver bir sonraki komutu bekliyor.",
    };
  }, [selectedIncident, isSelectedAiActive]);

  return (
    <div className="flex flex-col min-h-screen bg-[#FAF6F2]">
      {/* 1. Full-Width Single Dark Ink Top Bar */}
      <OsNavbar
        onResetComplete={loadData}
        onOpenSimulator={() => setIsSimulatorOpen(true)}
        activeSev1={hasActiveSev1}
        services={servicesData?.services || []}
      />

      {/* 2. Focused 2-Panel Master-Detail Workstation Layout */}
      <main className="max-w-[1600px] mx-auto w-full p-2.5 sm:p-4 flex-1 flex flex-col lg:flex-row gap-4 items-stretch lg:overflow-hidden">
        {/* API Error Callout if any */}
        {error && (
          <div className="border-[1.5px] border-[#D9383A] bg-[#FFFFFF] p-2.5 font-mono text-xs text-[#D9383A] os-window-shadow flex items-center justify-between lg:col-span-12">
            <span>[UYARI] API Bağlantı Hatası: {error} (Port 3001 kontrol ediliyor...)</span>
            <button
              type="button"
              onClick={loadData}
              className="px-2 py-0.5 bg-[#D9383A] text-[#FFFFFF] border border-[#522D60] font-bold text-[10px] cursor-pointer"
            >
              YENİDEN DENE
            </button>
          </div>
        )}

        {/* Left Column: AKTİF OLAYLAR & SOL ALT AI ORB PANELİ */}
        <aside className="w-full lg:w-[350px] xl:w-[380px] shrink-0 flex flex-col gap-3 sm:gap-4 lg:h-[calc(100vh-80px)] select-none">
          {/* Top Panel: AKTİF OLAYLAR (IncidentSidebar) */}
          <IncidentSidebar
            incidents={incidents}
            selectedIncidentId={selectedIncident?.id || null}
            onSelectIncident={(inc) => setSelectedIncidentId(inc.id)}
            onOpenSimulator={() => setIsSimulatorOpen(true)}
            className="flex-1 min-h-[220px]"
          />

          {/* Bottom Panel: SOL ALT AI DURUMU & ORB (RetroThinkingOrb) */}
          <RetroThinkingOrb
            isActive={orbStatus.isActive}
            stageLabel={orbStatus.stageLabel}
            badgeText={orbStatus.badgeText}
            statusText={orbStatus.statusText}
            compact
            className="shrink-0"
          />
        </aside>

        {/* Right Panel: OLAY AKIŞI (IncidentStream) */}
        <IncidentStream
          incident={selectedIncident}
          onOpenSimulator={() => setIsSimulatorOpen(true)}
          onIncidentUpdated={loadData}
        />
      </main>

      {/* External Telemetry Signal Injector Modal */}
      <SignalSimulatorModal
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        onSignalSent={loadData}
      />
    </div>
  );
}
