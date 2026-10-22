"use client";

import React, { useEffect, useState, useCallback } from "react";
import { OsNavbar } from "@/components/os/OsNavbar";
import { OsWindow } from "@/components/os/OsWindow";
import { OsBadge } from "@/components/os/OsBadge";
import { OsButton } from "@/components/os/OsButton";
import {
  fetchServices,
  fetchIncidents,
  sendTelemetrySignal,
  Service,
  Incident,
  ServicesResponse,
} from "@/lib/api";

const PRESET_SIGNALS = [
  {
    name: "Ödeme 504 Timeout (DB Lock)",
    service_slug: "checkout",
    error_code: "HTTP_504_DB_LOCK",
    message: "Checkout payment process timed out waiting for database row lock on payment_records table (48 threads blocked).",
    metrics: { error_rate: 0.94, p99_latency_ms: 14200, affected_users: 312 },
  },
  {
    name: "Sepet Kupon NaN Hatası (Redis)",
    service_slug: "cart",
    error_code: "REDIS_COUPON_NAN",
    message: "Cart promotion engine received NaN for percentage calculation from corrupt Redis key promo_v2.",
    metrics: { error_rate: 0.28, p99_latency_ms: 450, affected_users: 85 },
  },
  {
    name: "Görsel CDN Şişmesi (Önbellek)",
    service_slug: "catalog",
    error_code: "CDN_CACHE_BLOAT",
    message: "Product image thumbnail cache memory pressure exceeded 92%, causing intermittent slow image renders.",
    metrics: { error_rate: 0.05, memory_pressure: 0.93 },
  },
];

export default function CommandWorkstationPage() {
  const [servicesData, setServicesData] = useState<ServicesResponse | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Signal Injector State
  const [selectedService, setSelectedService] = useState<string>("checkout");
  const [errorCode, setErrorCode] = useState<string>("HTTP_504_DB_LOCK");
  const [errorMessage, setErrorMessage] = useState<string>(
    "Checkout payment transaction timed out waiting for row lock."
  );
  const [injecting, setInjecting] = useState<boolean>(false);
  const [injectFeedback, setInjectFeedback] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [sRes, iRes] = await Promise.all([fetchServices(), fetchIncidents()]);
      setServicesData(sRes);
      setIncidents(iRes.incidents);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "API bağlantı hatası");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleApplyPreset = (preset: typeof PRESET_SIGNALS[0]) => {
    setSelectedService(preset.service_slug);
    setErrorCode(preset.error_code);
    setErrorMessage(preset.message);
  };

  const handleSendSignal = async (e: React.FormEvent) => {
    e.preventDefault();
    setInjecting(true);
    setInjectFeedback(null);
    try {
      await sendTelemetrySignal({
        service_slug: selectedService,
        error_code: errorCode,
        message: errorMessage,
        metadata: {
          injected_from: "APPSOLVE.OS1 Command Workstation",
          client: "QuickCart iOS v3.4.1",
        },
      });
      setInjectFeedback(`Sinyal başarıyla iletildi (${errorCode})!`);
      await loadData();
    } catch (err) {
      setInjectFeedback(
        `Hata: ${err instanceof Error ? err.message : "Sinyal gönderilemedi"}`
      );
    } finally {
      setInjecting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <OsNavbar onResetComplete={loadData} />

      <main className="max-w-7xl mx-auto w-full p-3 sm:p-4 space-y-4">
        {/* System Telemetry Bar */}
        <div className="border-[1.5px] border-[#522D60] bg-[#FAF6F2] px-3 py-2 flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] os-window-shadow">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 bg-[#522D60]" />
            <span className="font-bold text-[#522D60]">
              TELEMETRY: {servicesData?.services.length || 4} QUICKCART SERVİSİ İZLENİYOR
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div>
              DURUM:{" "}
              {servicesData?.system_status === "all_operational" ? (
                <span className="font-bold text-[#1E8E5A]">● TÜM SİSTEMLER OPERASYONEL</span>
              ) : (
                <span className="font-bold text-[#D9383A]">▲ SİSTEMDE AKTİF OLAY VAR</span>
              )}
            </div>
            <div>|</div>
            <div>
              AKTİF OLAY:{" "}
              <span className="font-bold text-[#522D60]">
                {incidents.filter((i) => i.status !== "resolved").length}
              </span>
            </div>
            <div>|</div>
            <div>
              GUARDRAILS: <span className="font-bold text-[#80426E]">OTONOMİ KİLİDİ AKTİF</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="border-[1.5px] border-[#D9383A] bg-[#FFFFFF] p-3 font-mono text-xs text-[#D9383A] os-window-shadow flex items-center justify-between">
            <span>[UYARI] API Bağlantı Hatası: {error} (Port 3001 kontrol ediliyor...)</span>
            <OsButton variant="crimson" size="sm" onClick={loadData}>
              YENİDEN DENE
            </OsButton>
          </div>
        )}

        {/* 1. QuickCart Service Health Matrix */}
        <OsWindow
          title="SERVICE_HEALTH_MATRIX"
          version="1.1"
          variant="ink"
          headerRight={
            <span>
              SON SENKRON: {servicesData?.last_synced_at ? new Date(servicesData.last_synced_at).toLocaleTimeString() : "--:--:--"}
            </span>
          }
        >
          {loading && !servicesData ? (
            <div className="py-8 text-center font-mono text-xs text-[#80426E]">
              Servis telemetrisi yükleniyor...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {servicesData?.services.map((svc: Service, idx: number) => {
                const isOp = svc.status === "operational";
                const isDegraded = svc.status === "degraded";
                const isOutage = svc.status === "outage";

                return (
                  <div
                    key={svc.slug}
                    className="border-[1.5px] border-[#522D60] p-3 bg-[#FAF6F2] flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-center justify-between border-b border-[#522D60]/30 pb-1.5 mb-2">
                        <span className="font-mono text-[10px] text-[#80426E]">
                          0{idx + 1} // {svc.slug.toUpperCase()}
                        </span>
                        <OsBadge
                          variant={isOp ? "operational" : isDegraded ? "degraded" : "outage"}
                          pulse={!isOp}
                        >
                          {svc.status_label}
                        </OsBadge>
                      </div>

                      <h3 className="font-mono font-bold text-[14px] text-[#522D60]">
                        {svc.name}
                      </h3>
                      <div className="font-mono text-[10px] text-[#80426E] mb-2">
                        {svc.name_en}
                      </div>

                      <p className="text-[11px] text-[#522D60]/90 leading-tight">
                        {svc.description}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-[#522D60]/30 font-mono text-[10px] text-[#522D60] flex items-center justify-between">
                      <span>UPTIME: {svc.uptime_percentage}%</span>
                      <span>
                        {svc.last_incident_at
                          ? new Date(svc.last_incident_at).toLocaleTimeString()
                          : "Sinyal: Yok"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </OsWindow>

        {/* 2-Column Split: Telemetry Feed + Signal Simulator */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Telemetry Ingest Feed */}
          <div className="lg:col-span-7">
            <OsWindow
              title="TELEMETRY_INGESTION_FEED"
              version="1.1"
              variant="mulberry"
              headerRight={
                <span>TOPLAM KAYIT: {incidents.length}</span>
              }
              contentClassName="p-0"
            >
              {incidents.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <div className="font-mono text-xs text-[#522D60] font-bold">
                    [TELEMETRİ DİNLENİYOR]
                  </div>
                  <p className="text-[12px] text-[#80426E] max-w-md mx-auto">
                    QuickCart mobil istemcisinden veya sağdaki simülatörden henüz ham hata sinyali gelmedi.
                    Sinyal geldiğinde saniye saniye burada listelenecektir.
                  </p>
                </div>
              ) : (
                <div className="divide-y-[1.5px] divide-[#522D60] max-h-[480px] overflow-y-auto">
                  {incidents.map((inc) => (
                    <article key={inc.id} className="p-3 hover:bg-[#FAF6F2] transition-none space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-mono text-[11px]">
                          <span className="font-bold text-[#522D60] bg-[#FFD38B] px-1.5 py-0.2 border border-[#522D60]">
                            {inc.incident_code}
                          </span>
                          <span className="font-semibold text-[#80426E]">
                            [{inc.service.name} / {inc.service.slug}]
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {inc.severity ? (
                            <OsBadge
                              variant={
                                inc.severity === "SEV-1"
                                  ? "sev1"
                                  : inc.severity === "SEV-2"
                                  ? "sev2"
                                  : "sev3"
                              }
                            >
                              {inc.severity}
                            </OsBadge>
                          ) : (
                            <OsBadge variant="amber">ANALİZ BEKLİYOR</OsBadge>
                          )}
                          <OsBadge variant="paper">{inc.status.toUpperCase()}</OsBadge>
                        </div>
                      </div>

                      <div className="font-mono text-[12px] font-semibold text-[#522D60]">
                        {inc.title}
                      </div>

                      {/* Events Log */}
                      {inc.events && inc.events.length > 0 && (
                        <div className="bg-[#FAF6F2] border border-[#522D60]/40 p-2 font-mono text-[10px] space-y-1">
                          {inc.events.map((ev) => (
                            <div key={ev.id} className="flex items-start gap-2 text-[#522D60]">
                              <span className="text-[#80426E] shrink-0">
                                [{new Date(ev.occurred_at).toLocaleTimeString()}]
                              </span>
                              <span className="font-bold shrink-0">{ev.title}:</span>
                              <span className="text-[#522D60]/80 truncate">{ev.details}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </OsWindow>
          </div>

          {/* External Telemetry Signal Injector (QuickCart Simulator) */}
          <div className="lg:col-span-5">
            <OsWindow
              title="SIGNAL_SIMULATOR"
              version="1.1"
              variant="apricot"
              headerRight={<span>POST /telemetry/signals</span>}
            >
              <form onSubmit={handleSendSignal} className="space-y-3 font-mono text-[11px]">
                <p className="text-[11px] font-sans text-[#522D60] leading-tight">
                  Harici QuickCart uygulamasını simüle ederek doğrudan Rails API{" "}
                  <code className="bg-[#FAF6F2] px-1 border border-[#522D60] font-mono text-[10px]">
                    POST /api/v1/telemetry/signals
                  </code>{" "}
                  uç noktasına ham telemetri sinyali gönderin:
                </p>

                {/* Presets */}
                <div>
                  <label className="block text-[10px] font-bold text-[#80426E] uppercase mb-1">
                    Hızlı Şablonlar:
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {PRESET_SIGNALS.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => handleApplyPreset(p)}
                        className="px-2 py-1 text-[9px] border border-[#522D60] bg-[#FFFFFF] hover:bg-[#FAF6F2] text-[#522D60] cursor-pointer"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Service Selection */}
                <div>
                  <label className="block text-[10px] font-bold text-[#80426E] uppercase mb-1">
                    Hedef Servis:
                  </label>
                  <select
                    value={selectedService}
                    onChange={(e) => setSelectedService(e.target.value)}
                    className="w-full border-[1.5px] border-[#522D60] px-2 py-1.5 bg-[#FFFFFF] text-[#522D60] text-[11px] font-mono focus:outline-none"
                  >
                    <option value="checkout">Ödeme Servisi (checkout)</option>
                    <option value="cart">Sepet Servisi (cart)</option>
                    <option value="catalog">Katalog Servisi (catalog)</option>
                    <option value="auth">Giriş Servisi (auth)</option>
                  </select>
                </div>

                {/* Error Code */}
                <div>
                  <label className="block text-[10px] font-bold text-[#80426E] uppercase mb-1">
                    Hata Kodu (error_code):
                  </label>
                  <input
                    type="text"
                    value={errorCode}
                    onChange={(e) => setErrorCode(e.target.value)}
                    required
                    className="w-full border-[1.5px] border-[#522D60] px-2 py-1.5 bg-[#FFFFFF] text-[#522D60] text-[11px] font-mono focus:outline-none"
                    placeholder="Örn: HTTP_504_DB_LOCK"
                  />
                </div>

                {/* Message */}
                <div>
                  <label className="block text-[10px] font-bold text-[#80426E] uppercase mb-1">
                    Ham Hata Mesajı:
                  </label>
                  <textarea
                    rows={3}
                    value={errorMessage}
                    onChange={(e) => setErrorMessage(e.target.value)}
                    required
                    className="w-full border-[1.5px] border-[#522D60] px-2 py-1.5 bg-[#FFFFFF] text-[#522D60] text-[11px] font-mono focus:outline-none"
                    placeholder="Hata detayları..."
                  />
                </div>

                {injectFeedback && (
                  <div className="p-2 border border-[#522D60] bg-[#FFD38B] text-[#522D60] text-[10px] font-bold">
                    {injectFeedback}
                  </div>
                )}

                <OsButton
                  type="submit"
                  variant="apricot"
                  size="md"
                  disabled={injecting}
                  className="w-full"
                >
                  {injecting ? "GÖNDERİLİYOR..." : "[ SİNYAL ENJEKTE ET ]"}
                </OsButton>
              </form>
            </OsWindow>
          </div>
        </div>

        {/* 3. Theme & Token Specification Inspector (Master Plan Compliance) */}
        <OsWindow
          title="DESIGN_SYSTEM_SPEC"
          version="1.1"
          variant="paper"
          headerRight={<span>COLORHUNT + WORKSTATION TOKENS</span>}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2 font-mono text-[10px]">
            <div className="p-2 bg-[#522D60] text-[#FFFFFF] border border-[#522D60]">
              <div className="font-bold">--os-ink</div>
              <div>#522D60</div>
            </div>
            <div className="p-2 bg-[#80426E] text-[#FFFFFF] border border-[#522D60]">
              <div className="font-bold">--os-mulberry</div>
              <div>#80426E</div>
            </div>
            <div className="p-2 bg-[#F2A67B] text-[#522D60] border border-[#522D60]">
              <div className="font-bold">--os-apricot</div>
              <div>#F2A67B</div>
            </div>
            <div className="p-2 bg-[#FFD38B] text-[#522D60] border border-[#522D60]">
              <div className="font-bold">--os-amber</div>
              <div>#FFD38B</div>
            </div>
            <div className="p-2 bg-[#FFFFFF] text-[#522D60] border border-[#522D60]">
              <div className="font-bold">--os-paper</div>
              <div>#FFFFFF</div>
            </div>
            <div className="p-2 bg-[#FAF6F2] text-[#522D60] border border-[#522D60]">
              <div className="font-bold">--os-desk</div>
              <div>#FAF6F2</div>
            </div>
            <div className="p-2 bg-[#D9383A] text-[#FFFFFF] border border-[#522D60]">
              <div className="font-bold">--os-crimson</div>
              <div>#D9383A</div>
            </div>
            <div className="p-2 bg-[#1E8E5A] text-[#FFFFFF] border border-[#522D60]">
              <div className="font-bold">--os-phosphor</div>
              <div>#1E8E5A</div>
            </div>
          </div>
        </OsWindow>
      </main>
    </div>
  );
}
