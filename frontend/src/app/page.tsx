"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { OsNavbar } from "@/components/os/OsNavbar";
import { IncidentSidebar } from "@/components/workstation/IncidentSidebar";
import { IncidentStream } from "@/components/workstation/IncidentStream";
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

        {/* Left Panel: AKTİF OLAYLAR (IncidentSidebar) */}
        <IncidentSidebar
          incidents={incidents}
          selectedIncidentId={selectedIncident?.id || null}
          onSelectIncident={(inc) => setSelectedIncidentId(inc.id)}
          onOpenSimulator={() => setIsSimulatorOpen(true)}
        />

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
