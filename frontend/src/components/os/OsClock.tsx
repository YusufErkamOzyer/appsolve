"use client";

import React, { useEffect, useState } from "react";

export function OsClock({ className = "" }: { className?: string }) {
  const [timeStr, setTimeStr] = useState<string>("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const seconds = String(now.getSeconds()).padStart(2, "0");
      setTimeStr(`${hours}:${minutes}:${seconds}`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 bg-[#FAF6F2] border-[1.5px] border-[#522D60] font-mono text-[11px] font-semibold text-[#522D60] tabular-nums select-none ${className}`}
    >
      <span className="w-1.5 h-1.5 bg-[#522D60]" />
      <span>{timeStr || "--:--:--"}</span>
    </div>
  );
}
