"use client";

import React, { useState, useMemo } from "react";

export interface UnifiedDiffViewerProps {
  diff: string;
  filePath?: string;
  title?: string;
  defaultExpanded?: boolean;
  className?: string;
}

interface ParsedLine {
  type: "add" | "delete" | "context" | "hunk_header" | "meta";
  oldLineNumber?: number;
  newLineNumber?: number;
  sign: string;
  content: string;
}

interface ParsedHunk {
  header: string;
  lines: ParsedLine[];
}

interface ParsedDiffResult {
  detectedFilePath: string | null;
  hunks: ParsedHunk[];
  totalAdditions: number;
  totalDeletions: number;
}

export function parseUnifiedDiff(rawDiff: string): ParsedDiffResult {
  const lines = rawDiff.split(/\r?\n/);
  const hunks: ParsedHunk[] = [];
  let currentHunk: ParsedHunk | null = null;
  let detectedFilePath: string | null = null;
  let totalAdditions = 0;
  let totalDeletions = 0;

  let currentOld = 0;
  let currentNew = 0;

  const hunkRegex = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect file headers: --- a/path or +++ b/path
    if (line.startsWith("--- ")) {
      const match = line.replace(/^---\s+([ab]\/)?/, "").trim();
      if (match && !detectedFilePath) detectedFilePath = match;
      continue;
    }
    if (line.startsWith("+++ ")) {
      const match = line.replace(/^\+\+\+\s+([ab]\/)?/, "").trim();
      if (match) detectedFilePath = match;
      continue;
    }

    // Check for hunk header @@ -a,b +c,d @@
    const hunkMatch = line.match(hunkRegex);
    if (hunkMatch) {
      currentOld = parseInt(hunkMatch[1], 10);
      currentNew = parseInt(hunkMatch[3], 10);

      currentHunk = {
        header: line.trim(),
        lines: [],
      };
      hunks.push(currentHunk);
      continue;
    }

    // If lines occur before any hunk header, treat as fallback hunk
    if (!currentHunk) {
      currentHunk = {
        header: "@@ -1 +1 @@",
        lines: [],
      };
      hunks.push(currentHunk);
      currentOld = 1;
      currentNew = 1;
    }

    if (line.startsWith("+")) {
      totalAdditions++;
      currentHunk.lines.push({
        type: "add",
        newLineNumber: currentNew++,
        sign: "+",
        content: line.slice(1),
      });
    } else if (line.startsWith("-")) {
      totalDeletions++;
      currentHunk.lines.push({
        type: "delete",
        oldLineNumber: currentOld++,
        sign: "-",
        content: line.slice(1),
      });
    } else if (line.startsWith("\\")) {
      // e.g. \ No newline at end of file
      currentHunk.lines.push({
        type: "meta",
        sign: " ",
        content: line,
      });
    } else {
      // Context line
      const content = line.startsWith(" ") ? line.slice(1) : line;
      currentHunk.lines.push({
        type: "context",
        oldLineNumber: currentOld++,
        newLineNumber: currentNew++,
        sign: " ",
        content,
      });
    }
  }

  return {
    detectedFilePath,
    hunks,
    totalAdditions,
    totalDeletions,
  };
}

export function UnifiedDiffViewer({
  diff,
  filePath,
  title,
  defaultExpanded = true,
  className = "",
}: UnifiedDiffViewerProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [copied, setCopied] = useState<boolean>(false);

  const parsed = useMemo(() => {
    if (!diff || !diff.trim()) return null;
    return parseUnifiedDiff(diff);
  }, [diff]);

  if (!parsed || parsed.hunks.length === 0) {
    return null;
  }

  const effectivePath = filePath || parsed.detectedFilePath || "patch.diff";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(diff);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div
      className={`border-[1.5px] border-[#522D60] bg-[#FFFFFF] os-window-shadow-sm overflow-hidden select-none ${className}`}
    >
      {/* 1. Retro Header Bar */}
      <div className="h-8 px-2.5 bg-[#FAF6F2] border-b-[1.5px] border-[#522D60] flex items-center justify-between font-mono text-[10px] gap-2">
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <span className="text-[#80426E] font-bold text-xs shrink-0">◧</span>
          <span className="font-bold text-[#522D60] shrink-0">
            {title || "UNIFIED DIFF"}
          </span>

          {/* Affected file path badge */}
          <span
            className="px-1.5 py-0.5 bg-[#FFFFFF] border border-[#522D60] text-[#522D60] font-bold truncate max-w-[200px] sm:max-w-xs"
            title={effectivePath}
          >
            {effectivePath}
          </span>

          {/* Diff stats badge */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="px-1 py-0.2 bg-[#EEFBF3] border border-[#1E8E5A]/40 text-[#1E8E5A] font-bold text-[9px]">
              +{parsed.totalAdditions}
            </span>
            <span className="px-1 py-0.2 bg-[#FDF2F2] border border-[#D9383A]/40 text-[#D9383A] font-bold text-[9px]">
              -{parsed.totalDeletions}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="px-2 py-0.5 bg-[#FFFFFF] hover:bg-[#FAF6F2] text-[#522D60] border border-[#522D60] font-mono text-[9px] font-bold cursor-pointer transition-none os-active-press flex items-center gap-1"
            title="Yamayı Panoya Kopyala"
          >
            <span>{copied ? "✓" : "📋"}</span>
            <span>{copied ? "KOPYALANDI" : "KOPYALA"}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-2 py-0.5 bg-[#FFFFFF] hover:bg-[#FAF6F2] text-[#80426E] border border-[#522D60]/40 font-mono text-[9px] font-bold cursor-pointer transition-none"
            title={isExpanded ? "Diff görünümünü daralt" : "Diff görünümünü genişlet"}
          >
            {isExpanded ? "▼ DARALT" : "▶ GENİŞLET"}
          </button>
        </div>
      </div>

      {/* 2. Line-by-Line Unified Diff Body */}
      {isExpanded && (
        <div className="overflow-x-auto max-h-72 overflow-y-auto font-mono text-[11px] leading-5 bg-[#FFFFFF] select-text">
          <table className="w-full border-collapse font-mono text-[11px]">
            <tbody>
              {parsed.hunks.map((hunk, hIdx) => (
                <React.Fragment key={`hunk-${hIdx}`}>
                  {/* Hunk Header */}
                  <tr className="bg-[#FAF6F2] border-y border-[#522D60]/20 select-none">
                    <td
                      colSpan={2}
                      className="w-16 sm:w-20 text-center py-0.5 text-[9px] text-[#80426E]/60 border-r border-[#522D60]/10"
                    >
                      ...
                    </td>
                    <td className="w-5 text-center text-[#80426E] font-bold text-[10px]">
                      @@
                    </td>
                    <td className="pl-2 pr-4 py-0.5 text-[#80426E] text-[10px] font-bold tracking-tight">
                      {hunk.header}
                    </td>
                  </tr>

                  {/* Hunk Lines */}
                  {hunk.lines.map((line, lIdx) => {
                    const isAdd = line.type === "add";
                    const isDel = line.type === "delete";

                    let rowBg = "bg-transparent hover:bg-[#FAF6F2]/50";
                    let rowBorder = "";
                    let textColor = "text-[#522D60]";
                    let signColor = "text-[#522D60]/40";

                    if (isAdd) {
                      rowBg = "bg-[#EEFBF3] hover:bg-[#E5F8EC]";
                      rowBorder = "border-l-[3px] border-[#1E8E5A]";
                      textColor = "text-[#1E8E5A] font-semibold";
                      signColor = "text-[#1E8E5A] font-bold";
                    } else if (isDel) {
                      rowBg = "bg-[#FDF2F2] hover:bg-[#FCE8E8]";
                      rowBorder = "border-l-[3px] border-[#D9383A]";
                      textColor = "text-[#D9383A]";
                      signColor = "text-[#D9383A] font-bold";
                    } else if (line.type === "meta") {
                      rowBg = "bg-[#FAF6F2]";
                      textColor = "text-[#80426E] italic text-[10px]";
                    }

                    return (
                      <tr
                        key={`h-${hIdx}-l-${lIdx}`}
                        className={`${rowBg} ${rowBorder} transition-colors`}
                      >
                        {/* Old Line Number */}
                        <td className="w-8 sm:w-10 text-right px-1.5 py-0 text-[10px] text-[#80426E]/60 select-none tabular-nums border-r border-[#522D60]/10">
                          {line.oldLineNumber ?? ""}
                        </td>

                        {/* New Line Number */}
                        <td className="w-8 sm:w-10 text-right px-1.5 py-0 text-[10px] text-[#80426E]/60 select-none tabular-nums border-r border-[#522D60]/10">
                          {line.newLineNumber ?? ""}
                        </td>

                        {/* Sign Column (+ / -) */}
                        <td
                          className={`w-5 text-center text-xs select-none ${signColor}`}
                        >
                          {line.sign}
                        </td>

                        {/* Line Code Content */}
                        <td
                          className={`pl-2 pr-4 py-0 font-mono whitespace-pre text-[11px] ${textColor}`}
                        >
                          {line.content || " "}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
