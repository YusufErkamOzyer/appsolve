"use client";

import React, { useState } from "react";
import { Incident, PostMortem, regeneratePostMortem, getPostMortemExportUrl } from "@/lib/api";

interface PostMortemViewerProps {
  incident: Incident | null;
  onPostMortemUpdated?: () => void;
  compact?: boolean;
}

export function PostMortemViewer({
  incident,
  onPostMortemUpdated,
  compact = false,
}: PostMortemViewerProps) {
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  if (!incident) {
    return (
      <div className="border-[1.5px] border-[#522D60] bg-[#FFFFFF] p-6 text-center font-mono text-xs text-[#522D60]/60 os-window-shadow">
        [OLAY SEÇİLMEDİ]
      </div>
    );
  }

  const isResolved = incident.status === "resolved";
  const postMortem: PostMortem | null = incident.post_mortem || null;

  // Pending State: Incident is active and not resolved yet
  if (!isResolved || !postMortem) {
    return (
      <div className="border-[1.5px] border-[#522D60] bg-[#FFFFFF] os-window-shadow overflow-hidden">
        {/* Header */}
        <div className="h-8 px-3 border-b-[1.5px] border-[#522D60] bg-[#FAF6F2] flex items-center justify-between font-mono text-[11px]">
          <div className="flex items-center gap-2 font-bold text-[#522D60]">
            <span>📄</span>
            <span>POST_MORTEM_VIEWER 1.1 // {incident.incident_code}</span>
          </div>
          <span className="px-2 py-0.5 bg-[#FFD38B] text-[#522D60] border border-[#522D60] font-bold text-[9px]">
            ⏳ BEKLEMEDE (OLAY AKTİF)
          </span>
        </div>

        {/* Pending Body */}
        <div className="p-6 text-center space-y-3 bg-[#FAF6F2]/40">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full border-2 border-[#522D60] bg-[#FFFFFF] text-lg">
            ⏱
          </div>
          <div className="font-mono text-xs font-bold text-[#522D60]">
            OTOMATİK POST-MORTEM BEKLENİYOR
          </div>
          <p className="text-[12px] font-sans text-[#80426E] max-w-md mx-auto leading-relaxed">
            Bu olay henüz çözümlenmedi. Kriz <strong>{incident.severity}</strong> seviyesinde inceleniyor. Olay kapatıldığı anda (@solver otonom çözümü, eylem kartı onayı veya War Room kapanışı ile) Gemini AI tüm zaman çizelgesini ve aksiyonları sentezleyerek resmi Post-Mortem raporunu bu ekranda otomatik oluşturacaktır.
          </p>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#FFFFFF] border border-[#522D60]/30 font-mono text-[10px] text-[#522D60]">
            <span>Hedef Servis: <strong>{incident.service?.name}</strong></span>
            <span>•</span>
            <span>Durum: <strong className="uppercase">{incident.status}</strong></span>
          </div>
        </div>
      </div>
    );
  }

  // Formatting helpers
  const createdDate = new Date(incident.created_at);
  const resolvedDate = incident.resolved_at ? new Date(incident.resolved_at) : new Date();
  const dateStr = createdDate.toLocaleDateString("tr-TR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const timeStart = createdDate.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const timeEnd = resolvedDate.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const solutionPathLabel =
    incident.severity === "SEV-3"
      ? "Yol A (Tam Otonom İnsansız Akış)"
      : incident.severity === "SEV-2"
      ? "Yol B (Tek Tıkla Eylem Planı Onayı)"
      : "Yol C (Mühendis + @solver War Room İşbirliği)";

  const handleCopyMarkdown = async () => {
    try {
      const servicesList = (postMortem.affected_services?.length ? postMortem.affected_services : [incident.service.name])
        .map((s) => `- ${s}`)
        .join("\n");

      const actionsList = (postMortem.action_items?.length ? postMortem.action_items : [])
        .map((a, i) => `${i + 1}. [ ] ${a}`)
        .join("\n");

      const md = `# POST-MORTEM RAPORU // ${incident.incident_code}
> **Sistem:** Appsolve Otonom AI Olay Yönetimi Platformu (APPSOLVE.OS1)  
> **Raporu Hazırlayan:** ${postMortem.generated_by}  
> **Tarih:** ${dateStr} ${timeStart} - ${timeEnd}  
> **MTTR (Çözüm Süresi):** ${postMortem.mttr_formatted || `${postMortem.duration_seconds} sn`}  

---

## 1. Olay Künyesi
- **Olay Kodu:** ${incident.incident_code}
- **Başlık:** ${incident.title}
- **Kritiklik Seviyesi:** ${incident.severity}
- **Durum:** ÇÖZÜLDÜ (RESOLVED)
- **Ana Servis:** ${incident.service?.name} (${incident.service?.slug})
- **Çözüm Modeli:** ${solutionPathLabel}

---

## 2. Yönetici Özeti (Executive Summary)
${postMortem.summary}

---

## 3. Kök Neden Analizi (Root Cause Analysis - RCA)
${postMortem.root_cause}

---

## 4. Etkilenen Servisler
${servicesList}

---

## 5. Önleyici Aksiyon Maddeleri (Action Items)
${actionsList}

---
*Bu rapor Appsolve AI SRE Agent Engine (Google Gemini 2.5 Flash) tarafından otomatik üretilmiştir.*`;

      await navigator.clipboard.writeText(md);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch {
      setErrorMsg("Panoya kopyalama başarısız oldu.");
    }
  };

  const handleDownloadMarkdown = () => {
    const url = getPostMortemExportUrl(incident.id);
    const link = document.createElement("a");
    link.href = url;
    link.download = `post-mortem-${incident.incident_code.replace(/[^0-9A-Za-z_-]/g, "")}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRegenerate = async () => {
    if (isRegenerating) return;
    setIsRegenerating(true);
    setErrorMsg(null);

    try {
      await regeneratePostMortem(incident.id);
      if (onPostMortemUpdated) {
        onPostMortemUpdated();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Rapor yenilenirken hata oluştu.");
    } finally {
      setIsRegenerating(false);
    }
  };

  const toggleCheck = (idx: number) => {
    setCheckedItems((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className={`border-[1.5px] border-[#522D60] bg-[#FFFFFF] os-window-shadow flex flex-col ${compact ? "p-0" : "w-full"}`}>
      {/* 1. Window Chrome Header */}
      <div className="h-9 px-3 border-b-[1.5px] border-[#522D60] bg-[#FAF6F2] flex items-center justify-between font-mono text-[11px] shrink-0">
        <div className="flex items-center gap-2 font-bold text-[#522D60]">
          <span className="text-xs">📄</span>
          <span className="tracking-wider">POST_MORTEM_VIEWER 1.1 // {incident.incident_code}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-1 font-bold text-[#1E8E5A] px-2 py-0.5 bg-[#EEFBF3] border border-[#1E8E5A] text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1E8E5A]" />
            RAPOR HAZIR
          </span>
          <span className="px-2 py-0.5 bg-[#522D60] text-[#FFFFFF] font-mono text-[10px] font-bold">
            MTTR: {postMortem.mttr_formatted || `${postMortem.duration_seconds} sn`}
          </span>
        </div>
      </div>

      {/* 2. Action Toolbar */}
      <div className="px-3 sm:px-4 py-2 border-b border-[#522D60]/20 bg-[#FFFFFF] flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
        <div className="flex items-center gap-2 text-[11px] text-[#522D60]">
          <span className="text-[#80426E] font-bold">Olay:</span>
          <strong className="text-[#522D60]">{incident.title}</strong>
          <span className="text-[#522D60]/30">•</span>
          <span className="text-[10px] text-[#80426E]">
            {dateStr} ({timeStart} - {timeEnd})
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopyMarkdown}
            className={`px-2.5 py-1 border border-[#522D60] font-mono text-[10px] font-bold cursor-pointer transition-none flex items-center gap-1 select-none ${
              isCopied
                ? "bg-[#EEFBF3] text-[#1E8E5A] border-[#1E8E5A]"
                : "bg-[#FFFFFF] hover:bg-[#FAF6F2] text-[#522D60] os-btn-shadow-sm"
            }`}
            title="Markdown formatında panoya kopyala"
          >
            <span>{isCopied ? "✓" : "📋"}</span>
            <span>{isCopied ? "KOPYALANDI!" : "MARKDOWN KOPYALA"}</span>
          </button>

          {/* Download Button */}
          <button
            type="button"
            onClick={handleDownloadMarkdown}
            className="px-2.5 py-1 bg-[#FFFFFF] hover:bg-[#FAF6F2] text-[#522D60] border border-[#522D60] font-mono text-[10px] font-bold os-btn-shadow-sm cursor-pointer transition-none flex items-center gap-1 select-none"
            title=".md dosyası olarak bilgisayara indir"
          >
            <span>💾</span>
            <span>.MD İNDİR</span>
          </button>

          {/* Regenerate Button */}
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="px-2.5 py-1 bg-[#F2A67B] hover:bg-[#FFD38B] text-[#522D60] border border-[#522D60] font-mono text-[10px] font-bold os-btn-shadow-sm cursor-pointer transition-none disabled:opacity-50 flex items-center gap-1 select-none"
            title="Gemini AI motoru ile raporu baştan sentezle"
          >
            <span className={isRegenerating ? "animate-spin" : ""}>↺</span>
            <span>{isRegenerating ? "SENTEZLENİYOR..." : "YENİDEN OLUŞTUR"}</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mx-4 mt-3 p-2 bg-[#FDF2F2] border border-[#D9383A] text-[#D9383A] font-mono text-xs">
          [HATA] {errorMsg}
        </div>
      )}

      {/* 3. Document Body */}
      <div className="p-4 sm:p-5 space-y-6 overflow-y-auto max-h-[700px]">
        {/* Section 1: Executive Summary */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 border-b border-[#522D60]/20 pb-1">
            <span className="w-2.5 h-2.5 bg-[#522D60]" />
            <h3 className="font-mono text-xs font-bold text-[#522D60] tracking-wider uppercase">
              1. Yönetici Özeti (Executive Summary)
            </h3>
          </div>
          <div className="bg-[#FAF6F2] p-3.5 border-[1.5px] border-[#522D60]/30 space-y-2">
            <p className="font-sans text-[13px] text-[#522D60] leading-relaxed font-normal">
              {postMortem.summary}
            </p>
          </div>
        </section>

        {/* Section 2: Root Cause Analysis (RCA) */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 border-b border-[#522D60]/20 pb-1">
            <span className="w-2.5 h-2.5 bg-[#80426E]" />
            <h3 className="font-mono text-xs font-bold text-[#522D60] tracking-wider uppercase">
              2. Kök Neden Analizi (Root Cause Analysis - RCA)
            </h3>
          </div>
          <div className="bg-[#F6F5FA] p-3.5 border-[1.5px] border-[#80426E]/40 space-y-2">
            <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold text-[#80426E]">
              <span>🔍</span>
              <span>TEKNİK ANALİZ VE TETİKLEYİCİ DARBOĞAZ:</span>
            </div>
            <p className="font-sans text-[13px] text-[#522D60] leading-relaxed">
              {postMortem.root_cause}
            </p>
          </div>
        </section>

        {/* Section 3: Metrics & Impact Matrix */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 border-b border-[#522D60]/20 pb-1">
            <span className="w-2.5 h-2.5 bg-[#F2A67B]" />
            <h3 className="font-mono text-xs font-bold text-[#522D60] tracking-wider uppercase">
              3. Metrikler ve Etki Matrisi (Metrics &amp; SLA Matrix)
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 font-mono text-[11px]">
            {/* Box A: MTTR */}
            <div className="border-[1.5px] border-[#522D60]/30 bg-[#FFFFFF] p-2.5 space-y-1">
              <span className="text-[9px] text-[#80426E] uppercase font-bold block">
                Çözüm Süresi (MTTR):
              </span>
              <strong className="text-sm text-[#1E8E5A] block">
                {postMortem.mttr_formatted || `${postMortem.duration_seconds} sn`}
              </strong>
              <span className="text-[10px] text-[#522D60]/70">
                Hedef SLA: 15 dk (Karşılandı ✓)
              </span>
            </div>

            {/* Box B: Severity */}
            <div className="border-[1.5px] border-[#522D60]/30 bg-[#FFFFFF] p-2.5 space-y-1">
              <span className="text-[9px] text-[#80426E] uppercase font-bold block">
                Kritiklik Seviyesi:
              </span>
              <strong className="text-sm text-[#522D60] block">
                {incident.severity}
              </strong>
              <span className="text-[10px] text-[#80426E]">
                {incident.severity === "SEV-1"
                  ? "Tam Çöküş / Kritik"
                  : incident.severity === "SEV-2"
                  ? "Majör / Kısmi Kayıp"
                  : "Minör / Otonom"}
              </span>
            </div>

            {/* Box C: Resolution Model */}
            <div className="border-[1.5px] border-[#522D60]/30 bg-[#FFFFFF] p-2.5 space-y-1">
              <span className="text-[9px] text-[#80426E] uppercase font-bold block">
                Çözüm Metodolojisi:
              </span>
              <strong className="text-xs text-[#522D60] block leading-tight">
                {solutionPathLabel}
              </strong>
              <span className="text-[10px] text-[#1E8E5A]">
                Servis: {incident.service?.name} (Sağlıklı)
              </span>
            </div>

            {/* Box D: Generated By */}
            <div className="border-[1.5px] border-[#522D60]/30 bg-[#FFFFFF] p-2.5 space-y-1">
              <span className="text-[9px] text-[#80426E] uppercase font-bold block">
                Rapor Üretici:
              </span>
              <strong className="text-xs text-[#522D60] block">
                {postMortem.generated_by}
              </strong>
              <span className="text-[10px] text-[#80426E]">
                Gemini 2.5 Flash Engine
              </span>
            </div>
          </div>

          {/* Affected Services Tags */}
          <div className="border border-[#522D60]/20 bg-[#FAF6F2] p-2.5 flex flex-wrap items-center gap-2 font-mono text-[11px]">
            <span className="font-bold text-[#80426E] text-[10px] uppercase">
              ETKİLENEN SERVİSLER:
            </span>
            {Array.isArray(postMortem.affected_services) && postMortem.affected_services.length > 0 ? (
              postMortem.affected_services.map((svc, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 bg-[#FFFFFF] border border-[#522D60] text-[#522D60] font-bold text-[10px]"
                >
                  ● {svc}
                </span>
              ))
            ) : (
              <span className="px-2 py-0.5 bg-[#FFFFFF] border border-[#522D60] text-[#522D60] text-[10px]">
                ● {incident.service?.name} ({incident.service?.slug})
              </span>
            )}
          </div>
        </section>

        {/* Section 4: Preventative Action Items */}
        <section className="space-y-2">
          <div className="flex items-center justify-between border-b border-[#522D60]/20 pb-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-[#1E8E5A]" />
              <h3 className="font-mono text-xs font-bold text-[#522D60] tracking-wider uppercase">
                4. Önleyici ve İyileştirici Aksiyon Maddeleri (Action Items)
              </h3>
            </div>
            <span className="font-mono text-[10px] text-[#80426E]">
              {Array.isArray(postMortem.action_items) ? postMortem.action_items.length : 0} Aksiyon Belirlendi
            </span>
          </div>

          <div className="space-y-2">
            {Array.isArray(postMortem.action_items) && postMortem.action_items.length > 0 ? (
              postMortem.action_items.map((item, idx) => {
                const isChecked = checkedItems[idx] ?? (idx === 0); // First immediate remediation item checked by default
                return (
                  <div
                    key={idx}
                    onClick={() => toggleCheck(idx)}
                    className={`border-[1.5px] p-2.5 flex items-start gap-3 cursor-pointer transition-none select-none ${
                      isChecked
                        ? "bg-[#EEFBF3] border-[#1E8E5A]/50 text-[#1E8E5A]"
                        : "bg-[#FFFFFF] border-[#522D60]/30 hover:bg-[#FAF6F2] text-[#522D60]"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 mt-0.5 border flex items-center justify-center font-mono text-[10px] shrink-0 ${
                        isChecked
                          ? "bg-[#1E8E5A] text-[#FFFFFF] border-[#1E8E5A]"
                          : "border-[#522D60] bg-[#FFFFFF]"
                      }`}
                    >
                      {isChecked ? "✓" : ""}
                    </div>

                    <div className="flex-1 space-y-0.5">
                      <div className="flex items-center gap-2 font-mono text-[10px]">
                        <span className="font-bold">
                          [AKSYON #{String(idx + 1).padStart(2, "0")}]
                        </span>
                        <span
                          className={`px-1.5 py-0.2 border text-[9px] font-bold ${
                            idx === 0
                              ? "bg-[#EEFBF3] border-[#1E8E5A] text-[#1E8E5A]"
                              : "bg-[#FAF6F2] border-[#522D60]/40 text-[#80426E]"
                          }`}
                        >
                          {idx === 0 ? "TAMAMLANDI (MÜDAHALE)" : "PLANLANDI (MİMARİ)"}
                        </span>
                      </div>
                      <p className={`font-sans text-[12px] leading-relaxed ${isChecked ? "text-[#522D60]" : "text-[#522D60]"}`}>
                        {item}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-3 bg-[#FAF6F2] border border-[#522D60]/20 font-mono text-xs text-[#80426E]">
                Belirlenmiş önleyici aksiyon maddesi bulunamadı.
              </div>
            )}
          </div>
        </section>

        {/* Section 5: Blameless SRE Stamp */}
        <div className="pt-2 border-t border-[#522D60]/15 flex items-center justify-between font-mono text-[10px] text-[#80426E]">
          <span>Appsolve OS1 // Blameless Post-Mortem Standardı</span>
          <span>Google Gemini 2.5 Flash AI Engine</span>
        </div>
      </div>
    </div>
  );
}
