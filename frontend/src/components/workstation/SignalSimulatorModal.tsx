"use client";

import React, { useState, useEffect } from "react";
import { OsWindow } from "../os/OsWindow";
import { OsButton } from "../os/OsButton";
import { sendTelemetrySignal } from "@/lib/api";

interface SignalSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignalSent: () => Promise<void> | void;
}

const PRESETS = [
  {
    name: "Ödeme 504 Timeout (DB Lock - SEV-1)",
    service_slug: "checkout",
    error_code: "HTTP_504_DB_LOCK",
    message: "Checkout payment process timed out waiting for database row lock on payment_records table (48 threads blocked).",
    metrics: { error_rate: 0.94, p99_latency_ms: 14200, affected_users: 312 },
  },
  {
    name: "Sepet Kupon NaN Hatası (Redis - SEV-2)",
    service_slug: "cart",
    error_code: "REDIS_COUPON_NAN",
    message: "Cart promotion engine received NaN for percentage calculation from corrupt Redis key promo_v2.",
    metrics: { error_rate: 0.28, p99_latency_ms: 450, affected_users: 85 },
  },
  {
    name: "Görsel CDN Şişmesi (Önbellek - SEV-3)",
    service_slug: "catalog",
    error_code: "CDN_CACHE_BLOAT",
    message: "Product image thumbnail cache memory pressure exceeded 92%, causing intermittent slow image renders.",
    metrics: { error_rate: 0.05, memory_pressure: 0.93 },
  },
  {
    name: "Giriş OAuth Token İmzası (Auth - SEV-1)",
    service_slug: "auth",
    error_code: "AUTH_OAUTH_SIGNATURE_EXPIRED",
    message: "Authentication service keystore rotation failed, all incoming mobile JWT tokens rejected with 401 Unauthorized.",
    metrics: { error_rate: 0.88, affected_users: 1420 },
  },
];

export function SignalSimulatorModal({
  isOpen,
  onClose,
  onSignalSent,
}: SignalSimulatorModalProps) {
  const [selectedService, setSelectedService] = useState<string>("checkout");
  const [errorCode, setErrorCode] = useState<string>("HTTP_504_DB_LOCK");
  const [errorMessage, setErrorMessage] = useState<string>(
    "Checkout payment transaction timed out waiting for row lock."
  );
  const [currentMetrics, setCurrentMetrics] = useState<Record<string, unknown>>(
    PRESETS[0].metrics
  );
  const [injecting, setInjecting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleApplyPreset = (preset: typeof PRESETS[0]) => {
    setSelectedService(preset.service_slug);
    setErrorCode(preset.error_code);
    setErrorMessage(preset.message);
    setCurrentMetrics(preset.metrics);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInjecting(true);
    setFeedback(null);

    try {
      await sendTelemetrySignal({
        service_slug: selectedService,
        error_code: errorCode,
        message: errorMessage,
        metrics: currentMetrics,
        metadata: {
          injected_from: "APPSOLVE.OS1 Signal Simulator",
          client: "QuickCart Mobile Client v3.4.1",
        },
      });

      setFeedback("Sinyal iletildi! Gemini AI SRE Triage tamamlandı.");
      await onSignalSent();

      setTimeout(() => {
        onClose();
        setFeedback(null);
      }, 700);
    } catch (err) {
      setFeedback(
        `Hata: ${err instanceof Error ? err.message : "Sinyal gönderilemedi"}`
      );
    } finally {
      setInjecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#522D60]/40 backdrop-blur-xs">
      <div className="w-full max-w-xl">
        <OsWindow
          title="SIGNAL_SIMULATOR"
          version="1.1"
          variant="apricot"
          headerRight={
            <button
              type="button"
              onClick={onClose}
              className="px-1.5 py-0.2 bg-[#522D60] text-[#FFFFFF] border border-[#522D60] font-bold text-[10px] hover:bg-[#80426E] cursor-pointer"
            >
              [✕ KAPAT]
            </button>
          }
        >
          <form onSubmit={handleSubmit} className="space-y-3 font-mono text-[11px]">
            <p className="text-[11px] font-sans text-[#522D60] leading-tight">
              Harici QuickCart mobil istemcisini simüle ederek Rails API{" "}
              <code className="bg-[#FAF6F2] px-1 border border-[#522D60] font-mono text-[10px]">
                POST /api/v1/telemetry/signals
              </code>{" "}
              uç noktasına ham hata telemetrisi gönderin:
            </p>

            {/* Presets */}
            <div>
              <label className="block text-[10px] font-bold text-[#80426E] uppercase mb-1">
                Hızlı Şablonlar:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => handleApplyPreset(p)}
                    className="p-1.5 text-left text-[10px] border border-[#522D60] bg-[#FFFFFF] hover:bg-[#FAF6F2] text-[#522D60] cursor-pointer truncate"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Service Selection */}
            <div>
              <label className="block text-[10px] font-bold text-[#80426E] uppercase mb-1">
                Hedef QuickCart Servisi:
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
              />
            </div>

            {/* Raw Message */}
            <div>
              <label className="block text-[10px] font-bold text-[#80426E] uppercase mb-1">
                Ham Hata Mesajı:
              </label>
              <textarea
                rows={2}
                value={errorMessage}
                onChange={(e) => setErrorMessage(e.target.value)}
                required
                className="w-full border-[1.5px] border-[#522D60] px-2 py-1.5 bg-[#FFFFFF] text-[#522D60] text-[11px] font-mono focus:outline-none"
              />
            </div>

            {feedback && (
              <div className="p-2 border border-[#522D60] bg-[#FFD38B] text-[#522D60] text-[10px] font-bold">
                {feedback}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#522D60]/20">
              <OsButton
                type="button"
                variant="paper"
                size="sm"
                onClick={onClose}
              >
                İPTAL
              </OsButton>
              <OsButton
                type="submit"
                variant="apricot"
                size="md"
                disabled={injecting}
              >
                {injecting ? "GÖNDERİLİYOR..." : "[ SİNYALİ ENJEKTE ET ]"}
              </OsButton>
            </div>
          </form>
        </OsWindow>
      </div>
    </div>
  );
}
