import React from "react";

interface OsBadgeProps {
  variant?:
    | "sev1"
    | "sev2"
    | "sev3"
    | "operational"
    | "degraded"
    | "outage"
    | "ink"
    | "mulberry"
    | "apricot"
    | "amber"
    | "crimson"
    | "paper";
  pulse?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function OsBadge({
  variant = "ink",
  pulse = false,
  children,
  className = "",
}: OsBadgeProps) {
  const variantStyles = {
    sev1: "bg-[#D9383A] text-[#FFFFFF] border-[#522D60]",
    sev2: "bg-[#F2A67B] text-[#522D60] border-[#522D60] font-bold",
    sev3: "bg-[#FFD38B] text-[#522D60] border-[#522D60]",
    operational: "bg-[#1E8E5A] text-[#FFFFFF] border-[#522D60]",
    degraded: "bg-[#FFD38B] text-[#522D60] border-[#522D60]",
    outage: "bg-[#D9383A] text-[#FFFFFF] border-[#522D60]",
    ink: "bg-[#522D60] text-[#FFFFFF] border-[#522D60]",
    mulberry: "bg-[#80426E] text-[#FFFFFF] border-[#522D60]",
    apricot: "bg-[#F2A67B] text-[#522D60] border-[#522D60] font-bold",
    amber: "bg-[#FFD38B] text-[#522D60] border-[#522D60]",
    crimson: "bg-[#D9383A] text-[#FFFFFF] border-[#522D60]",
    paper: "bg-[#FFFFFF] text-[#522D60] border-[#522D60]",
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider border-[1.5px] select-none ${variantStyles} ${
        pulse ? "animate-pulse" : ""
      } ${className}`}
    >
      <span className="w-1.5 h-1.5 bg-current shrink-0" />
      {children}
    </span>
  );
}
