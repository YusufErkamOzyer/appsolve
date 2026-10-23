"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { OsNavbar } from "@/components/os/OsNavbar";
import { HeaderBar } from "@/components/workstation/HeaderBar";
import { IncidentQueue } from "@/components/workstation/IncidentQueue";
import { WarRoomShell } from "@/components/workstation/WarRoomShell";
import { TriagePanel } from "@/components/workstation/TriagePanel";
import { IncidentTimeline } from "@/components/workstation/IncidentTimeline";
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

  // 1500ms Visibility-Aware Reactive Polling Loop
  useEffect(() => {
    const runSync = async () => {
      await loadData();
    };

    void runSync();

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void runSync();
      }
    }, 1500);

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
  }, [loadData]);

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

  return (
    <div className="flex flex-col min-h-screen">
      <OsNavbar
        onResetComplete={loadData}
        onOpenSimulator={() => setIsSimulatorOpen(true)}
        activeSev1={hasActiveSev1}
      />

      <main className="max-w-[1440px] mx-auto w-full p-2.5 sm:p-4 space-y-3">
        {/* Error Notification */}
        {error && (
          <div className="border-[1.5px] border-[#D9383A] bg-[#FFFFFF] p-2.5 font-mono text-xs text-[#D9383A] os-window-shadow flex items-center justify-between">
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

        {/* 1. SEV-Sensitive Command Header & Microservices Health Strip */}
        <HeaderBar
          activeIncidents={activeIncidents}
          selectedIncident={selectedIncident}
          onSelectIncident={(inc) => setSelectedIncidentId(inc.id)}
          services={servicesData?.services || []}
          onOpenSimulator={() => setIsSimulatorOpen(true)}
        />

        {/* 2. 12-Column SRE Command Workstation Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
          {/* Left Column (3 Columns): Incident Queue */}
          <div className="lg:col-span-3">
            <IncidentQueue
              incidents={incidents}
              selectedIncidentId={selectedIncident?.id || null}
              onSelectIncident={(inc) => setSelectedIncidentId(inc.id)}
              onOpenSimulator={() => setIsSimulatorOpen(true)}
            />
          </div>

          {/* Center Column (5 Columns): War Room Diagnostic & Telemetry Shell */}
          <div className="lg:col-span-5">
            <WarRoomShell
              incident={selectedIncident}
              onOpenSimulator={() => setIsSimulatorOpen(true)}
            />
          </div>

          {/* Right Column (4 Columns): AI Triage Hypothesis + Chronological Timeline */}
          <div className="lg:col-span-4 space-y-3">
            <TriagePanel incident={selectedIncident} />
            <IncidentTimeline incident={selectedIncident} />
          </div>
        </div>
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
