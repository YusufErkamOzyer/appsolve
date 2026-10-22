"use client";

import React, { useEffect, useState, useCallback } from "react";
import { OsNavbar } from "@/components/os/OsNavbar";
import { OsWindow } from "@/components/os/OsWindow";
import { OsBadge } from "@/components/os/OsBadge";
import { fetchServices, Service, ServicesResponse } from "@/lib/api";

export default function StatusPage() {
  const [data, setData] = useState<ServicesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const res = await fetchServices();
      setData(res);
    } catch {
      // Handled silently for live polling
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [loadData]);

  const isAllGood = data?.system_status === "all_operational";

  return (
    <div className="flex flex-col min-h-screen">
      <OsNavbar onResetComplete={loadData} />

      <main className="max-w-5xl mx-auto w-full p-4 sm:p-6 space-y-6">
        {/* Status Hero Window */}
        <OsWindow
          title="QUICKCART_SYSTEM_STATUS"
          version="1.1"
          variant={isAllGood ? "ink" : "amber"}
          headerRight={
            <span>
              SON KONTROL: {data?.last_synced_at ? new Date(data.last_synced_at).toLocaleTimeString() : "--:--:--"}
            </span>
          }
        >
          <div className="py-6 px-4 text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 border-[1.5px] border-[#522D60] font-mono text-xs uppercase font-bold tracking-wider bg-[#FAF6F2]">
              <span
                className={`w-2.5 h-2.5 ${
                  isAllGood ? "bg-[#1E8E5A]" : "bg-[#D9383A] animate-pulse"
                }`}
              />
              <span>{data?.system_status_label || "Sistem Durumu Kontrol Ediliyor"}</span>
            </div>

            <p className="font-sans text-[13px] text-[#522D60] max-w-lg mx-auto">
              {isAllGood
                ? "Tüm QuickCart mobil ve web servisleri kesintisiz olarak hizmet vermektedir. Altyapı telemetrisi gerçek zamanlı doğrulanmaktadır."
                : "Bazı servislerimizde performans kaybı veya inceleme süreci devam etmektedir. Teknik ekibimiz durumu takip etmektedir."}
            </p>
          </div>
        </OsWindow>

        {/* Core Services Health Matrix */}
        <OsWindow
          title="SERVICE_HEALTH_MATRIX"
          version="1.1"
          variant="mulberry"
          headerRight={<span>4 TEMEL MİKROSERVİS</span>}
        >
          {loading && !data ? (
            <div className="py-6 text-center font-mono text-xs text-[#80426E]">
              Servis verileri yükleniyor...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {data?.services.map((svc: Service) => {
                const isOp = svc.status === "operational";
                const isDegraded = svc.status === "degraded";

                return (
                  <div
                    key={svc.slug}
                    className="border-[1.5px] border-[#522D60] p-3 bg-[#FAF6F2] flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2 pb-1 border-b border-[#522D60]/20">
                        <span className="font-mono text-[10px] text-[#80426E]">
                          {svc.slug.toUpperCase()}
                        </span>
                        <OsBadge
                          variant={isOp ? "operational" : isDegraded ? "degraded" : "outage"}
                        >
                          {svc.status_label}
                        </OsBadge>
                      </div>

                      <div className="font-mono font-bold text-[13px] text-[#522D60]">
                        {svc.name}
                      </div>
                      <div className="text-[11px] text-[#522D60]/80 mt-1">
                        {svc.description}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#522D60]/20 font-mono text-[10px] text-[#80426E] flex justify-between">
                      <span>Kullanılabilirlik</span>
                      <span className="font-bold text-[#522D60]">{svc.uptime_percentage}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </OsWindow>

        {/* Public Incident Feed */}
        <OsWindow
          title="PUBLIC_INCIDENT_FEED"
          version="1.1"
          variant="paper"
          headerRight={<span>KURUMSAL İLETİŞİM GÜNCELLEMELERİ</span>}
        >
          <div className="p-6 text-center space-y-2">
            <div className="font-mono text-[11px] font-bold text-[#522D60]">
              [BİLDİRİLEN BİR KESİNTİ BULUNMUYOR]
            </div>
            <p className="text-[12px] text-[#80426E] max-w-md mx-auto">
              Son 24 saat içinde müşterilerimizi etkileyen majör bir servis kesintisi yaşanmamıştır.
              Herhangi bir planlı bakım veya servis güncellemesi burada otomatik olarak yayınlanacaktır.
            </p>
          </div>
        </OsWindow>
      </main>
    </div>
  );
}
