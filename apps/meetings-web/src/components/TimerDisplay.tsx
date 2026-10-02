"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { formatClock } from "@/lib/format";

const formatSec = formatClock;

type TimerDisplayProps = {
  remainingSec: number;
  overtimeSec: number;
  /** Total planned duration in seconds – needed for the progress ring */
  plannedDurationSec?: number;
  size?: "sm" | "lg";
  className?: string;
};

export function TimerDisplay({
  remainingSec: initialRemaining,
  overtimeSec,
  plannedDurationSec,
  size = "sm",
  className,
}: TimerDisplayProps) {
  const [remaining, setRemaining] = useState(initialRemaining);
  const [overtime, setOvertime] = useState(overtimeSec);

  useEffect(() => {
    if (initialRemaining > 0) {
      setRemaining(initialRemaining);
      setOvertime(0);
    } else {
      setRemaining(0);
      setOvertime(overtimeSec);
    }
  }, [initialRemaining, overtimeSec]);

  useEffect(() => {
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r > 0) return r - 1;
        setOvertime((o) => o + 1);
        return 0;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const isOvertime = remaining === 0 && (overtime > 0 || overtimeSec > 0);
  const total = plannedDurationSec ?? initialRemaining + overtimeSec;
  const progress = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;

  // Urgency: warning when <20% remaining, overtime when 0
  const isWarning = !isOvertime && total > 0 && remaining / total < 0.2;

  // SVG ring dimensions
  const ringSize = size === "lg" ? 160 : 80;
  const strokeWidth = size === "lg" ? 8 : 5;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div className={cn("inline-flex flex-col items-center gap-1", className)}>
      <div className="relative" style={{ width: ringSize, height: ringSize }}>
        {/* Background ring */}
        <svg
          width={ringSize}
          height={ringSize}
          className="absolute inset-0 -rotate-90"
        >
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className="stroke-muted"
          />
          {/* Progress ring */}
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={isOvertime ? 0 : strokeDashoffset}
            className={cn(
              "transition-[stroke-dashoffset] duration-1000 ease-linear",
              isOvertime
                ? "stroke-destructive"
                : isWarning
                  ? "stroke-warning"
                  : "stroke-primary",
            )}
          />
        </svg>
        {/* Time text */}
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center",
            isWarning && !isOvertime && "animate-pulse",
          )}
        >
          <span
            className={cn(
              "font-semibold tabular-nums",
              size === "lg" ? "text-3xl" : "text-lg",
              isOvertime
                ? "text-destructive"
                : isWarning
                  ? "text-warning"
                  : "text-foreground",
            )}
          >
            {isOvertime ? `+${formatSec(overtime)}` : formatSec(remaining)}
          </span>
        </div>
      </div>
      {isOvertime && (
        <span
          className={cn(
            "font-medium text-destructive",
            size === "lg" ? "text-base" : "text-xs",
          )}
        >
          Destiempo
        </span>
      )}
    </div>
  );
}
