"use client";

import React, { useEffect, useRef } from "react";

export interface RetroThinkingOrbProps {
  statusText?: string;
  stageLabel?: string;
  badgeText?: string;
  targetFps?: number;
  compact?: boolean;
  isActive?: boolean;
  className?: string;
}

const CANVAS = 200;
const TAU = Math.PI * 2;
const TARGET_FPS = 12;

// Dotted sphere 3D data points
const RINGS = 12;
const DOT_LIST: { x: number; y: number; z: number }[] = [];
for (let k = 0; k < RINGS; k++) {
  const y = 1 - ((k + 0.5) / RINGS) * 2;
  const r = Math.sqrt(1 - y * y);
  const m = Math.max(4, Math.round(20 * r));
  for (let j = 0; j < m; j++) {
    const a = (j / m) * TAU + k * 0.4;
    DOT_LIST.push({ x: Math.cos(a) * r, y, z: Math.sin(a) * r });
  }
}
const N = DOT_LIST.length;
const DX = Float32Array.from(DOT_LIST, (d) => d.x);
const DY = Float32Array.from(DOT_LIST, (d) => d.y);
const DZ = Float32Array.from(DOT_LIST, (d) => d.z);

export function RetroThinkingOrb({
  statusText = "@solver aktif kriz analizi yürütüyor...",
  stageLabel = "@SOLVER AI DURUMU",
  badgeText,
  targetFps = TARGET_FPS,
  compact = false,
  isActive = true,
  className = "",
}: RetroThinkingOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const angleRef = useRef<number>(0.85);

  // Retro Canvas Drawing Loop (12 FPS Quantized Rendering)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;

    let progress = 1;
    let previousTime: number | null = null;
    const interval = 1000 / targetFps;

    const drawFrame = (currentAngle: number) => {
      ctx.clearRect(0, 0, CANVAS, CANVAS);

      const cosA = Math.cos(currentAngle);
      const sinA = Math.sin(currentAngle);
      const center = CANVAS / 2;
      const radius = compact ? 46 : 58;
      const easedProgress = progress * progress * (3 - 2 * progress);

      // Subtle base orbit ring
      ctx.beginPath();
      ctx.ellipse(center, center + radius * 1.08, radius * 1.35, radius * 0.32, 0, 0, TAU);
      ctx.strokeStyle = isActive ? "rgba(255, 211, 139, 0.25)" : "rgba(82, 45, 96, 0.15)";
      ctx.lineWidth = 1;
      ctx.stroke();

      for (let i = 0; i < N; i++) {
        const sphereX = DX[i] * cosA + DZ[i] * sinA;
        const sphereZ = -DX[i] * sinA + DZ[i] * cosA;
        const x = DX[i] + (sphereX - DX[i]) * easedProgress;
        const z = DZ[i] + (sphereZ - DZ[i]) * easedProgress;
        const y = -1.08 + (DY[i] + 1.08) * easedProgress;

        const f = 2.4 / (2.4 - z);
        const rawPx = center + x * radius * f;
        const rawPy = center - y * radius * f - z * radius * 0.32 * (1 - easedProgress);
        const px = Math.floor(rawPx / 3) * 3;
        const py = Math.floor(rawPy / 3) * 3;

        const depth = ((z + 1) / 2) * easedProgress;
        const size = depth > 0.6 ? 4 : depth > 0.3 ? 3 : 2;

        if (!isActive) {
          // Subtle resting monochrome palette when inactive
          if (depth > 0.65) {
            ctx.fillStyle = "#80426E";
          } else if (depth > 0.35) {
            ctx.fillStyle = "#A36D94";
          } else {
            ctx.fillStyle = "#C8B2C4";
          }
          ctx.globalAlpha = 0.5 + easedProgress * 0.4;
        } else {
          // Vibrant active retro amber palette
          if (easedProgress < 0.08) {
            ctx.fillStyle = "#F2A67B";
          } else if (depth > 0.65) {
            ctx.fillStyle = "#FFD38B";
          } else if (depth > 0.35) {
            ctx.fillStyle = "#F2A67B";
          } else {
            ctx.fillStyle = "#80426E";
          }
          ctx.globalAlpha = 0.45 + easedProgress * 0.55;
        }

        ctx.fillRect(px, py, size, size);
      }
      ctx.globalAlpha = 1;
    };

    // If active, run animation frame loop; if inactive, draw static frame
    if (!isActive) {
      drawFrame(angleRef.current);
      return;
    }

    const render = (now: number) => {
      rafRef.current = requestAnimationFrame(render);

      const delta = previousTime === null ? 0 : now - previousTime;
      if (previousTime !== null && delta < interval) return;
      previousTime = now;

      angleRef.current += 0.12;
      drawFrame(angleRef.current);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isActive, targetFps, compact]);

  const defaultBadgeText = isActive ? "● İŞLENİYOR" : "● BEKLEMEDE";
  const displayBadge = badgeText || defaultBadgeText;

  return (
    <div
      className={`relative border-[1.5px] border-[#522D60] bg-[#FFFFFF] p-2.5 sm:p-3 font-mono text-[#522D60] os-window-shadow select-none overflow-hidden flex flex-col justify-between ${className}`}
    >
      {/* Retro Header Bar */}
      <div className="flex items-center justify-between border-b border-[#522D60]/20 pb-1.5 mb-2 text-[10px] shrink-0">
        <div className="flex items-center gap-1.5 font-bold text-[#522D60] truncate pr-1">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isActive ? "bg-[#F2A67B] animate-ping" : "bg-[#80426E]"
            }`}
          />
          <span className="tracking-wider truncate">{stageLabel.toUpperCase()}</span>
        </div>
        <span
          className={`px-1.5 py-0.2 border border-[#522D60] font-bold text-[9px] uppercase shrink-0 ${
            isActive
              ? "bg-[#FFD38B] text-[#522D60]"
              : "bg-[#FAF6F2] text-[#80426E]"
          }`}
        >
          {displayBadge}
        </span>
      </div>

      {/* Center Canvas Stage with Breathing Aura */}
      <div className="relative flex flex-col items-center justify-center py-1 sm:py-2 flex-1">
        {/* Glow Aura (active only) */}
        {isActive && (
          <div
            className="absolute w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-radial from-[#F2A67B]/25 via-[#80426E]/15 to-transparent blur-md pointer-events-none animate-pulse"
            aria-hidden="true"
          />
        )}

        {/* 12 FPS Pixel Canvas with responsive auto-scaling */}
        <canvas
          ref={canvasRef}
          width={CANVAS}
          height={CANVAS}
          className={`${
            compact
              ? "w-[72px] h-[72px] sm:w-[84px] sm:h-[84px]"
              : "w-[84px] h-[84px] sm:w-[100px] sm:h-[100px] xl:w-[115px] xl:h-[115px] max-h-[14vh]"
          } aspect-square relative z-10 filter drop-shadow-[0_0_8px_rgba(242,166,123,0.3)] transition-all`}
          role="img"
          aria-label="Yapay zeka retro orb animasyonu"
        />

        {/* Dynamic Status Text with Blinking Retro Block Cursor */}
        <div className="mt-2 w-full px-2.5 py-1.5 bg-[#FAF6F2] border-[1.5px] border-[#522D60] text-center shadow-xs shrink-0">
          <div className="font-mono font-bold text-[10px] sm:text-[11px] text-[#522D60] leading-snug flex items-center justify-center gap-1.5 break-words">
            <span className="line-clamp-2">{statusText}</span>
            {isActive && (
              <span className="inline-block w-1.5 h-3 bg-[#522D60] animate-pulse shrink-0" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}