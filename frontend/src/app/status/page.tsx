"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { OsNavbar } from "@/components/os/OsNavbar";
import { OsWindow } from "@/components/os/OsWindow";
import { OsBadge } from "@/components/os/OsBadge";
import { OsButton } from "@/components/os/OsButton";
import {
  fetchStatusPage,
  sendTelemetrySignal,
  resetSystem,
  Service,
  StatusPageResponse,
  StatusUpdateItem,
} from "@/lib/api";

export default function StatusPage() {
  const [data, setData] = useState<StatusPageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "resolved">("all");
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [sendingSignal, setSendingSignal] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetchStatusPage();
      setData(res);
    } catch {
      // Polled silently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const runSync = async () => {
      await loadData();
    };

    void runSync();
    const interval = setInterval(() => {
      void runSync();
    }, 3000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleSimulateSignal = async (
    serviceSlug: string,
    errorCode: string,
    message: string,
    severity: "SEV-1" | "SEV-2" | "SEV-3"
  ) => {
    setSendingSignal(true);
    setActionFeedback(`Mobil istemciden [${errorCode}] telemetri sinyali gönderiliyor...`);
    try {
      await sendTelemetrySignal({
        service_slug: serviceSlug,
        error_code: errorCode,
        message: message,
        severity: severity,
        metadata: {
          client_source: "mobile_app_ios_client",
          app_version: "2.4.1",
          device_model: "iPhone 15 Pro",
          os_version: "iOS 18.2",
          network_type: "5G",
        },
      });
      setActionFeedback(`Sinyal başarıyla iletildi! Durum sayfası canlı güncelleniyor.`);
      await loadData();
    } catch (err) {
      setActionFeedback(`Hata: ${err}`);
    } finally {
      setSendingSignal(false);
      setTimeout(() => setActionFeedback(null), 5000);
    }
  };

  const handleResetSystem = async () => {
    if (
      !confirm(
        "Sistem telemetrisi sıfırlanacak ve tüm servisler operasyonel yeşil duruma getirilecek. Onaylıyor musunuz?"
      )
    ) {
      return;
    }
    setActionFeedback("Sistem durumu sıfırlanıyor...");
    try {
      await resetSystem();
      setActionFeedback("Sistem sıfırlandı: Tüm servisler operasyonel.");
      await loadData();
    } catch (err) {
      setActionFeedback(`Sıfırlama hatası: ${err}`);
    } finally {
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

  const isAllGood = data?.system_status === "all_operational";
  const isPartial = data?.system_status === "partial_outage";
  const isMajor = data?.system_status === "major_outage";

  // Filter status updates
  const filteredUpdates = (data?.status_updates || []).filter((u: StatusUpdateItem) => {
    if (filter === "all") return true;
    if (filter === "active") {
      return u.phase === "investigating" || u.phase === "identified" || u.phase === "monitoring";
    }
    if (filter === "resolved") {
      return u.phase === "resolved" || u.phase === "autonomous_resolved";
    }
    return true;
  });

  const getPhaseBadgeVariant = (phase: string) => {
    switch (phase) {
      case "investigating":
        return "amber";
      case "identified":
        return "apricot";
      case "monitoring":
        return "mulberry";
      case "resolved":
      case "autonomous_resolved":
        return "operational";
      default:
        return "ink";
    }
  };

  const getSeverityBadgeVariant = (sev?: string | null) => {
    switch (sev) {
      case "SEV-1":
        return "sev1";
      case "SEV-2":
        return "sev2";
      case "SEV-3":
        return "sev3";
      default:
        return "ink";
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#FAF6F2]">
      <OsNavbar onResetComplete={loadData} services={data?.services} />

      <main className="max-w-5xl mx-auto w-full p-4 sm:p-6 space-y-6">
        {/* Navigation & Live Breadcrumb */}
        <div className="flex items-center justify-between font-mono text-[11px] text-[#522D60] border-b-[1.5px] border-[#522D60] pb-2">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/appsolve-icon.png" alt="Owl" className="w-3.5 h-3.5 object-contain inline-block" />
            <span className="font-bold">APPSOLVE.OS1 // PUBLIC STATUS PAGE</span>
            <span className="text-[#80426E]">/status</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-[#80426E]">
              MOBİL & WEB İSTEMCİLERİ İÇİN CANLI TELEMETRİ
            </span>
            <Link
              href="/"
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#522D60] text-[#FFFFFF] font-bold hover:bg-[#80426E] transition-colors"
            >
              <span>← SRE KOMUTA MERKEZİ</span>
            </Link>
          </div>
        </div>

        {/* Action feedback toast */}
        {actionFeedback && (
          <div className="border-[1.5px] border-[#522D60] bg-[#FFD38B] p-2.5 px-4 font-mono text-xs text-[#522D60] flex items-center justify-between animate-fade-in shadow-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-[#522D60] animate-ping" />
              <span>{actionFeedback}</span>
            </div>
            <button
              onClick={() => setActionFeedback(null)}
              className="font-bold hover:underline cursor-pointer ml-3"
            >
              [KAPAT]
            </button>
          </div>
        )}

        {/* Window 1: QUICKCART_SYSTEM_STATUS Hero */}
        <OsWindow
          title="QUICKCART_SYSTEM_STATUS"
          version="1.1"
          variant={isAllGood ? "ink" : isMajor ? "crimson" : "apricot"}
          headerRight={
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 inline-block ${
                  isAllGood ? "bg-[#1E8E5A]" : "bg-[#D9383A] animate-pulse"
                }`}
              />
              <span className="text-[10px]">
                SON SENKRONİZASYON:{" "}
                {data?.last_synced_at
                  ? new Date(data.last_synced_at).toLocaleTimeString()
                  : "--:--:--"}
              </span>
            </div>
          }
        >
          <div className="py-6 px-4 text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 border-[1.5px] border-[#522D60] font-mono text-xs uppercase font-bold tracking-wider bg-[#FFFFFF] shadow-xs">
              <span
                className={`w-2.5 h-2.5 ${
                  isAllGood
                    ? "bg-[#1E8E5A]"
                    : isMajor
                    ? "bg-[#D9383A] animate-pulse"
                    : "bg-[#F2A67B] animate-pulse"
                }`}
              />
              <span className="text-[#522D60]">
                {data?.system_status_label || "Sistem Durumu Doğrulanıyor..."}
              </span>
            </div>

            <p className="font-sans text-[13px] text-[#522D60] max-w-xl mx-auto leading-relaxed">
              {data?.system_status_description ||
                (isAllGood
                  ? "Tüm QuickCart mobil ve web servisleri kesintisiz olarak hizmet vermektedir. Altyapı telemetrisi gerçek zamanlı doğrulanmaktadır."
                  : "Servislerimizde performans kaybı veya inceleme süreci devam etmektedir. Teknik ekibimiz durumu takip etmektedir.")}
            </p>

            <div className="pt-2 flex items-center justify-center gap-4 text-[11px] font-mono text-[#80426E]">
              <span>OTOMATİK YENİLEME: 3s</span>
              <span>•</span>
              <span>SLA HEDEFİ: %99.95</span>
              <span>•</span>
              <span className="text-[#522D60] font-bold">
                AKTİF KESİNTİ: {data?.active_incidents?.length || 0}
              </span>
            </div>
          </div>
        </OsWindow>

        {/* Window 2: Core Microservices Health Matrix */}
        <OsWindow
          title="SERVICE_HEALTH_MATRIX"
          version="1.1"
          variant="mulberry"
          headerRight={<span>4 TEMEL MİKROSERVİS</span>}
        >
          {loading && !data ? (
            <div className="py-8 text-center font-mono text-xs text-[#80426E]">
              Mikroservis telemetrisi yükleniyor...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 p-1">
              {data?.services.map((svc: Service) => {
                const isOp = svc.status === "operational";
                const isDegraded = svc.status === "degraded";
                const isOutage = svc.status === "outage";

                return (
                  <div
                    key={svc.slug}
                    className={`border-[1.5px] border-[#522D60] p-3.5 bg-[#FFFFFF] flex flex-col justify-between space-y-3 transition-colors ${
                      isOutage
                        ? "bg-[#D9383A]/5 border-[#D9383A]"
                        : isDegraded
                        ? "bg-[#FFD38B]/10 border-[#F2A67B]"
                        : "hover:bg-[#FAF6F2]"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2 pb-1 border-b border-[#522D60]/20">
                        <span className="font-mono text-[10px] text-[#80426E] font-bold">
                          {svc.slug.toUpperCase()}
                        </span>
                        <OsBadge
                          variant={isOp ? "operational" : isDegraded ? "degraded" : "outage"}
                          pulse={!isOp}
                        >
                          {svc.status_label}
                        </OsBadge>
                      </div>

                      <div className="font-mono font-bold text-[14px] text-[#522D60]">
                        {svc.name}
                      </div>
                      <div className="text-[11px] text-[#522D60]/80 mt-1 leading-snug">
                        {svc.description}
                      </div>

                      {/* Active incident marker if any */}
                      {svc.active_incident && (
                        <div className="mt-2.5 p-1.5 border border-[#522D60] bg-[#FAF6F2] font-mono text-[10px] text-[#522D60]">
                          <div className="font-bold flex items-center gap-1 text-[#D9383A]">
                            <span className="w-1.5 h-1.5 bg-[#D9383A] animate-pulse" />
                            <span>{svc.active_incident.incident_code}</span>
                            <span className="text-[9px]">[{svc.active_incident.severity}]</span>
                          </div>
                          <div className="truncate text-[#522D60]/90 mt-0.5">
                            {svc.active_incident.title}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 pt-2 border-t border-[#522D60]/20">
                      {/* Retro 30-day uptime bars */}
                      <div className="space-y-1">
                        <div className="flex justify-between font-mono text-[9px] text-[#80426E]">
                          <span>Son 30 Gün</span>
                          <span className="font-bold text-[#522D60]">%{svc.uptime_percentage}</span>
                        </div>
                        <div className="flex gap-[2px] items-center">
                          {Array.from({ length: 30 }).map((_, idx) => {
                            const isLatest = idx === 29;
                            const barColor = isLatest && !isOp
                              ? isOutage
                                ? "bg-[#D9383A]"
                                : "bg-[#F2A67B]"
                              : "bg-[#1E8E5A]";
                            return (
                              <span
                                key={idx}
                                className={`h-3 flex-1 ${barColor} border-[0.5px] border-[#522D60]/40`}
                                title={
                                  isLatest && !isOp
                                    ? `Bugün: ${svc.status_label}`
                                    : `Gün ${idx + 1}: Operasyonel %100`
                                }
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </OsWindow>

        {/* Window 3: AI-Powered Corporate Incident Feed */}
        <OsWindow
          title="PUBLIC_INCIDENT_FEED"
          version="1.1"
          variant="ink"
          headerRight={
            <span className="text-[10px]">
              UYGULAMA SAHİBİ &amp; YÖNETİM EKİBİ BİLGİLENDİRME PANELİ
            </span>
          }
        >
          {/* Feed Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-[#FAF6F2] border-b-[1.5px] border-[#522D60] font-mono text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-[#522D60] mr-1">FİLTRE:</span>
              <button
                onClick={() => setFilter("all")}
                className={`px-2 py-0.5 border border-[#522D60] cursor-pointer transition-colors ${
                  filter === "all"
                    ? "bg-[#522D60] text-[#FFFFFF] font-bold"
                    : "bg-[#FFFFFF] text-[#522D60] hover:bg-[#FFD38B]/30"
                }`}
              >
                TÜMÜ ({data?.status_updates?.length || 0})
              </button>
              <button
                onClick={() => setFilter("active")}
                className={`px-2 py-0.5 border border-[#522D60] cursor-pointer transition-colors ${
                  filter === "active"
                    ? "bg-[#522D60] text-[#FFFFFF] font-bold"
                    : "bg-[#FFFFFF] text-[#522D60] hover:bg-[#FFD38B]/30"
                }`}
              >
                AKTİF KESİNTİLER
              </button>
              <button
                onClick={() => setFilter("resolved")}
                className={`px-2 py-0.5 border border-[#522D60] cursor-pointer transition-colors ${
                  filter === "resolved"
                    ? "bg-[#522D60] text-[#FFFFFF] font-bold"
                    : "bg-[#FFFFFF] text-[#522D60] hover:bg-[#FFD38B]/30"
                }`}
              >
                ÇÖZÜLENLER
              </button>
            </div>

            <div className="text-[10px] text-[#80426E]">
              Kurumsal Şeffaflık İlkesi: Uygulama sahibine ve yönetici ekibe anlık bildirim
            </div>
          </div>

          {/* Feed Content */}
          <div className="p-4 space-y-3">
            {filteredUpdates.length === 0 ? (
              <div className="p-8 text-center space-y-2 border-[1.5px] border-dashed border-[#522D60]/40 bg-[#FFFFFF]">
                <div className="font-mono text-[12px] font-bold text-[#522D60]">
                  [BİLDİRİLEN BİR KESİNTİ BULUNMUYOR]
                </div>
                <p className="text-[12px] text-[#80426E] max-w-md mx-auto leading-relaxed font-sans">
                  Son 24 saat içinde uygulamanızı etkileyen bir servis kesintisi yaşanmamıştır.
                  Tüm altyapı telemetrisi @solver tarafından gerçek zamanlı doğrulanmakta olup herhangi bir servis güncellemesi burada anında yayınlanacaktır.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredUpdates.map((update: StatusUpdateItem) => {
                  return (
                    <div
                      key={update.id}
                      className="border-[1.5px] border-[#522D60] bg-[#FFFFFF] p-3.5 space-y-2 shadow-xs transition-colors hover:border-[#80426E]"
                    >
                      {/* Meta header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#522D60]/15 pb-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Phase Badge */}
                          <OsBadge variant={getPhaseBadgeVariant(update.phase)}>
                            {update.phase_label}
                          </OsBadge>

                          {/* Service Tag */}
                          {update.service_name && (
                            <span className="px-2 py-0.5 font-mono text-[10px] font-bold bg-[#FAF6F2] border border-[#522D60] text-[#522D60]">
                              {update.service_name.toUpperCase()}
                            </span>
                          )}

                          {/* Severity & Incident Code */}
                          {update.incident_code && (
                            <span className="font-mono text-[10px] text-[#80426E]">
                              {update.incident_code}
                            </span>
                          )}

                          {update.severity && (
                            <OsBadge variant={getSeverityBadgeVariant(update.severity)}>
                              {update.severity}
                            </OsBadge>
                          )}
                        </div>

                        {/* Timestamp */}
                        <div className="font-mono text-[10px] text-[#80426E] flex items-center gap-1">
                          <span>{update.time_formatted || "--:--:--"}</span>
                          <span className="text-[9px] text-[#80426E]/60">
                            ({new Date(update.occurred_at).toLocaleDateString()})
                          </span>
                        </div>
                      </div>

                      {/* Public Corporate Message (Clean of internal technical jargon) */}
                      <div className="text-[13px] font-sans text-[#522D60] leading-relaxed pt-1">
                        {update.public_message}
                      </div>

                      {/* Verification Stamp */}
                      <div className="flex items-center justify-between pt-1 border-t border-[#522D60]/10 font-mono text-[9px] text-[#80426E]">
                        <span>✓ @solver Kurumsal Bilgilendirme Motoru tarafından doğrulandı</span>
                        <span className="text-[#1E8E5A] font-bold">CANLI YAYINDA</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </OsWindow>

        {/* Window 4: Mobile Client Integration & Live Telemetry Sandbox */}
        <OsWindow
          title="MOBILE_CLIENT_INTEGRATION"
          version="1.1"
          variant="apricot"
          headerRight={<span>REST API ENTEGRASYON KONSOLU</span>}
        >
          <div className="p-4 space-y-4 bg-[#FFFFFF]">
            <div className="space-y-1">
              <div className="font-mono font-bold text-[12px] text-[#522D60] flex items-center gap-2">
                <span className="w-2 h-2 bg-[#F2A67B]" />
                <span>GERÇEK MOBİL UYGULAMA (iOS / ANDROID) BAĞLANTI ALTYAPISI</span>
              </div>
              <p className="text-[12px] font-sans text-[#522D60]/90 leading-relaxed">
                Appsolve durum sayfası, doğrudan geliştirilecek yerel mobil uygulamaların telemetri gönderebileceği ve sistem sağlığını sorgulayabileceği standart RESTful JSON API altyapısıyla çalışır.
              </p>
            </div>

            {/* Endpoints Table */}
            <div className="border-[1.5px] border-[#522D60] overflow-x-auto">
              <table className="w-full font-mono text-[11px] text-left">
                <thead className="bg-[#522D60] text-[#FFFFFF]">
                  <tr>
                    <th className="p-2 border-r border-white/20">METOD</th>
                    <th className="p-2 border-r border-white/20">UÇ NOKTA (ENDPOINT)</th>
                    <th className="p-2">AÇIKLAMA VE MOBİL KULLANIM AMACI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#522D60]/20 bg-[#FAF6F2]">
                  <tr>
                    <td className="p-2 font-bold text-[#1E8E5A] border-r border-[#522D60]/20">GET</td>
                    <td className="p-2 font-bold text-[#522D60] border-r border-[#522D60]/20">/api/v1/status_page</td>
                    <td className="p-2 text-[#522D60]">Mobil açılış (splash) veya hata anında genel sistem durumunu ve kurumsal duyuruları hafif JSON olarak çeker.</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-bold text-[#1E8E5A] border-r border-[#522D60]/20">GET</td>
                    <td className="p-2 font-bold text-[#522D60] border-r border-[#522D60]/20">/api/v1/services</td>
                    <td className="p-2 text-[#522D60]">4 temel mikroservisin (Auth, Catalog, Cart, Checkout) anlık durumunu döner.</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-bold text-[#F2A67B] border-r border-[#522D60]/20">POST</td>
                    <td className="p-2 font-bold text-[#522D60] border-r border-[#522D60]/20">/api/v1/telemetry/signals</td>
                    <td className="p-2 text-[#522D60]">Mobil istemcide yakalanan gerçek çökme/hata sinyallerini AI SRE motoruna iletir.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Live Testing Triggers */}
            <div className="space-y-2 pt-2 border-t border-[#522D60]/20">
              <div className="font-mono text-[11px] font-bold text-[#522D60]">
                CANLI SUNUM VE ENTEGRASYON TEST BUTONLARI:
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <OsButton
                  variant="amber"
                  size="sm"
                  disabled={sendingSignal}
                  onClick={() =>
                    handleSimulateSignal(
                      "catalog",
                      "IMAGE_CDN_CACHE_BLOAT",
                      "Katalog CDN önbellek doluluğu %91 eşiğini aştı, küçük resimler yavaş yükleniyor.",
                      "SEV-3"
                    )
                  }
                >
                  ⚡ [SEV-3 Test: CDN Otonom]
                </OsButton>

                <OsButton
                  variant="apricot"
                  size="sm"
                  disabled={sendingSignal}
                  onClick={() =>
                    handleSimulateSignal(
                      "cart",
                      "CART_COUPON_NAN_ERROR",
                      "Kupon hesaplamada promo_v2 bayrağı NaN hatası verdi, indirimli sepetler kilitlendi.",
                      "SEV-2"
                    )
                  }
                >
                  ⚠️ [SEV-2 Test: Sepet Kuponu]
                </OsButton>

                <OsButton
                  variant="crimson"
                  size="sm"
                  disabled={sendingSignal}
                  onClick={() =>
                    handleSimulateSignal(
                      "checkout",
                      "PAYMENT_GATEWAY_DEADLOCK",
                      "Ödeme servisinde %94 hata oranı ve veritabanı kilitlenmesi tespit edildi.",
                      "SEV-1"
                    )
                  }
                >
                  🚨 [SEV-1 Test: Ödeme Kilitlenmesi]
                </OsButton>

                <OsButton
                  variant="paper"
                  size="sm"
                  disabled={sendingSignal}
                  onClick={handleResetSystem}
                >
                  ↺ [Sistemi Sıfırla (Reset)]
                </OsButton>
              </div>
            </div>
          </div>
        </OsWindow>
      </main>
    </div>
  );
}
