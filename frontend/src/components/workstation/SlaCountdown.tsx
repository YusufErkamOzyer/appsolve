"use client";

import React, { useEffect, useState } from "react";

interface SlaCountdownProps {
  deadline: string | null;
  resolvedAt?: string | null;
  compact?: boolean;
  className?: string;
}

export function SlaCountdown({
  deadline,
  resolvedAt,
  compact = false,
  className = "",
}: SlaCountdownProps) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!deadline || resolvedAt) return;

    const tick = () => {
      setNow(Date.now());
    };

    const initialTimer = setTimeout(tick, 0);
    const interval = setInterval(tick, 1000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [deadline, resolvedAt]);

  if (!deadline) {
    return <span className="opacity-60 font-mono">--:--:--</span>;
  }

  const deadlineMs = new Date(deadline).getTime();
  const targetMs = resolvedAt
    ? new Date(resolvedAt).getTime()
    : now ?? deadlineMs;

  const diffMs = deadlineMs - targetMs;
  const isBreached = diffMs < 0;
  const absDiff = Math.abs(diffMs);

  const hours = Math.floor(absDiff / (1000 * 60 * 60));
  const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((absDiff % (1000 * 60)) / 1000);

  const formattedTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  if (resolvedAt) {
    return (
      <span
        className={`font-mono tabular-nums text-[#1E8E5A] font-bold ${className}`}
        title={`Çözüm anındaki SLA hedefi: ${formattedTime}`}
      >
        {compact ? `SLA: ${formattedTime}` : `HEDEF TUTTURULDU: ${formattedTime}`}
      </span>
    );
  }

  if (now === null) {
    return <span className="opacity-60 font-mono">--:--:--</span>;
  }

  if (isBreached) {
    return (
      <span
        className={`font-mono tabular-nums font-bold text-[#FFFFFF] bg-[#D9383A] px-1.5 py-0.5 border border-[#522D60] animate-pulse ${className}`}
      >
        {compact ? `AŞILDI +${formattedTime}` : `SLA AŞILDI: +${formattedTime}`}
      </span>
    );
  }

  return (
    <span
      className={`font-mono tabular-nums font-bold ${
        compact
          ? "text-inherit"
          : "bg-[#FFD38B] text-[#522D60] px-2 py-0.5 border border-[#522D60]"
      } ${className}`}
    >
      {compact ? formattedTime : `SLA: ${formattedTime}`}
    </span>
  );
}
