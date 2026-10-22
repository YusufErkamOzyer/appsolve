import React from "react";

interface OsWindowProps {
  title: string;
  version?: string;
  variant?: "ink" | "mulberry" | "apricot" | "amber" | "crimson" | "paper";
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export function OsWindow({
  title,
  version = "1.1",
  variant = "ink",
  headerRight,
  children,
  className = "",
  contentClassName = "p-3",
}: OsWindowProps) {
  const headerVariantStyles = {
    ink: "bg-[#522D60] text-[#FFFFFF]",
    mulberry: "bg-[#80426E] text-[#FFFFFF]",
    apricot: "bg-[#F2A67B] text-[#522D60] font-bold",
    amber: "bg-[#FFD38B] text-[#522D60] font-bold",
    crimson: "bg-[#D9383A] text-[#FFFFFF] animate-pulse",
    paper: "bg-[#FFFFFF] text-[#522D60]",
  }[variant];

  return (
    <section className={`border-[1.5px] border-[#522D60] os-window-shadow bg-[#FFFFFF] ${className}`}>
      {/* Title Bar */}
      <div
        className={`h-7 px-2.5 flex items-center justify-between border-b-[1.5px] border-[#522D60] select-none ${headerVariantStyles}`}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="w-3.5 h-3.5 border border-current flex items-center justify-center text-[9px] font-mono leading-none">
            ■
          </span>
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider truncate">
            {title} <span className="opacity-80 font-normal">v{version}</span>
          </span>
        </div>
        {headerRight && (
          <div className="flex items-center gap-1.5 font-mono text-[10px]">
            {headerRight}
          </div>
        )}
      </div>

      {/* Window Body */}
      <div className={`bg-[#FFFFFF] ${contentClassName}`}>
        {children}
      </div>
    </section>
  );
}
