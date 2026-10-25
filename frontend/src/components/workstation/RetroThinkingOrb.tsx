"use client";

import React, { useEffect, useRef, useState } from "react";

export interface RetroThinkingOrbProps {
  statusText?: string;
  stageLabel?: string;
  targetFps?: number;
  compact?: boolean;
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
  stageLabel = "@SOLVER",
  targetFps = TARGET_FPS,
  compact = false,
}: RetroThinkingOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const [orbMotion] = useState<"orbiting">("orbiting");

  // Retro Canvas Drawing Loop (12 FPS Quantized Rendering)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;

    let angle = 0;
    let progress = 1;
    let previousTime: number | null = null;
    const interval = 1000 / targetFps;

    const render = (now: number) => {
      rafRef.current = requestAnimationFrame(render);

      const delta = previousTime === null ? 0 : now - previousTime;
      if (previousTime !== null && delta < interval) return;
      previousTime = now;

      angle += 0.12;

      ctx.clearRect(0, 0, CANVAS, CANVAS);

      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const center = CANVAS / 2;
      const radius = compact ? 46 : 58;
      const easedProgress = progress * progress * (3 - 2 * progress);

      // Subtle base orbit ring
      ctx.beginPath();
      ctx.ellipse(center, center + radius * 1.08, radius * 1.35, radius * 0.32, 0, 0, TAU);
      ctx.strokeStyle = "rgba(255, 211, 139, 0.25)";
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
        ctx.fillRect(px, py, size, size);
      }
      ctx.globalAlpha = 1;
    };

    rafRef.current = requestAnimationFrame(render);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [orbMotion, targetFps, compact]);

  return (
    <div className="relative border-[1.5px] border-[#522D60] bg-[#FAF6F2] p-4 font-mono text-[#522D60] os-window-shadow select-none overflow-hidden my-3">
      {/* Retro Header Bar */}
      <div className="flex items-center justify-between border-b border-[#522D60]/20 pb-2 mb-3 text-[10px]">
        <div className="flex items-center gap-1.5 font-bold text-[#522D60]">
          <span className="w-2 h-2 rounded-full bg-[#F2A67B] animate-ping" />
          <span className="tracking-wider">{stageLabel.toUpperCase()}</span>
        </div>
        <span className="px-1.5 py-0.2 bg-[#FFD38B] border border-[#522D60] font-bold text-[#522D60] text-[9px] uppercase">
          ● İŞLENİYOR
        </span>
      </div>

      {/* Center Canvas Stage with Breathing Aura */}
      <div className="relative flex flex-col items-center justify-center py-2">
        {/* Glow Aura */}
        <div
          className="absolute w-36 h-36 rounded-full bg-radial from-[#F2A67B]/25 via-[#80426E]/15 to-transparent blur-md pointer-events-none animate-pulse"
          aria-hidden="true"
        />

        {/* 12 FPS Pixel Canvas */}
        <canvas
          ref={canvasRef}
          width={CANVAS}
          height={CANVAS}
          className={`${compact ? "w-[140px] h-[140px]" : "w-[170px] h-[170px]"} relative z-10 filter drop-shadow-[0_0_10px_rgba(242,166,123,0.35)]`}
          role="img"
          aria-label="Yapay zeka retro orb animasyonu"
        />

        {/* Dynamic Status Text with Blinking Retro Block Cursor */}
        <div className="mt-2.5 px-3 py-1.5 bg-[#FFFFFF] border-[1.5px] border-[#522D60] max-w-lg text-center shadow-xs">
          <div className="font-mono font-bold text-[11px] sm:text-[12px] text-[#522D60] leading-snug flex items-center justify-center gap-1">
            <span>{statusText}</span>
            <span className="inline-block w-2 h-3.5 bg-[#522D60] animate-pulse shrink-0" />
          </div>
        </div>
      </div>
    </div>
  );
}
