import React from "react";

interface OsButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "apricot" | "ink" | "amber" | "paper" | "crimson";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

export function OsButton({
  variant = "apricot",
  size = "md",
  children,
  className = "",
  disabled,
  ...props
}: OsButtonProps) {
  const variantStyles = {
    apricot: "bg-[#F2A67B] text-[#522D60] hover:bg-[#f5b692] font-bold",
    ink: "bg-[#522D60] text-[#FFFFFF] hover:bg-[#643775]",
    amber: "bg-[#FFD38B] text-[#522D60] hover:bg-[#ffdeaa] font-bold",
    paper: "bg-[#FFFFFF] text-[#522D60] hover:bg-[#FAF6F2]",
    crimson: "bg-[#D9383A] text-[#FFFFFF] hover:bg-[#e24c4e]",
  }[variant];

  const sizeStyles = {
    sm: "px-2.5 py-1 text-[10px]",
    md: "px-3.5 py-1.5 text-[11px]",
    lg: "px-5 py-2 text-[12px] font-bold",
  }[size];

  return (
    <button
      disabled={disabled}
      className={`border-[1.5px] border-[#522D60] font-mono tracking-wider transition-none select-none ${
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "os-btn-shadow os-active-press cursor-pointer"
      } ${variantStyles} ${sizeStyles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
