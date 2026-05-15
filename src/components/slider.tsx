import * as React from "react";
import { cn } from "../lib/utils";

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (value: number) => void;
  className?: string;
  projectedSliderId?: string;
};

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onValueChange,
  className,
  projectedSliderId,
}: SliderProps) {
  return (
    <label className={cn("grid gap-1.5 text-xs text-slate-300", className)}>
      <span className="flex items-center justify-between">
        <span>{label}</span>
        <span className="font-mono text-cyan-100">{value}</span>
      </span>
      <input
        className="h-2 w-full cursor-pointer accent-cyan-300"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onValueChange(Number(event.target.value))}
        data-projected-slider="true"
        data-min={min}
        data-max={max}
        data-step={step}
        data-projected-slider-id={projectedSliderId}
      />
    </label>
  );
}
