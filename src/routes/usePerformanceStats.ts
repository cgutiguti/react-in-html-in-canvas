import { useEffect, useState, type RefObject } from "react";

export type PerformanceStats = {
  fps: number;
  frameMs: number;
  cpuRenderMs: number;
  gpuRenderMs: number | null;
  cpuHistory: number[];
  gpuHistory: Array<number | null>;
  heapUsedMb: number | null;
  heapTotalMb: number | null;
  canvasWidth: number;
  canvasHeight: number;
  dpr: number;
};

export type RenderPerformanceMetrics = {
  cpuRenderMs: number;
  gpuRenderMs: number | null;
};

type PerformanceWithMemory = Performance & {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
  };
};

type PerformanceMetricsSource = {
  getPerformanceMetrics(): RenderPerformanceMetrics;
};

export function usePerformanceStats(
  active: boolean,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  metricsRef: RefObject<PerformanceMetricsSource | null>,
) {
  const [stats, setStats] = useState<PerformanceStats>({
    fps: 0,
    frameMs: 0,
    cpuRenderMs: 0,
    gpuRenderMs: null,
    cpuHistory: [],
    gpuHistory: [],
    heapUsedMb: null,
    heapTotalMb: null,
    canvasWidth: 0,
    canvasHeight: 0,
    dpr: typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
  });

  useEffect(() => {
    if (!active) return;

    let frame = 0;
    let frames = 0;
    let frameMsTotal = 0;
    let lastFrameTime = performance.now();
    let lastPublishTime = lastFrameTime;
    let cpuHistory: number[] = [];
    let gpuHistory: Array<number | null> = [];

    const sample = (now: number) => {
      const delta = now - lastFrameTime;
      lastFrameTime = now;
      if (delta > 0 && delta < 1000) {
        frames += 1;
        frameMsTotal += delta;
      }

      if (now - lastPublishTime >= 500) {
        const elapsed = now - lastPublishTime;
        const memory = (performance as PerformanceWithMemory).memory;
        const canvas = canvasRef.current;
        const renderMetrics = metricsRef.current?.getPerformanceMetrics() ?? { cpuRenderMs: 0, gpuRenderMs: null };
        cpuHistory = appendGraphSample(cpuHistory, renderMetrics.cpuRenderMs);
        gpuHistory = appendGraphSample(gpuHistory, renderMetrics.gpuRenderMs);
        setStats({
          fps: frames > 0 ? Math.round((frames * 1000) / elapsed) : 0,
          frameMs: frames > 0 ? frameMsTotal / frames : 0,
          cpuRenderMs: renderMetrics.cpuRenderMs,
          gpuRenderMs: renderMetrics.gpuRenderMs,
          cpuHistory,
          gpuHistory,
          heapUsedMb: memory ? bytesToMegabytes(memory.usedJSHeapSize) : null,
          heapTotalMb: memory ? bytesToMegabytes(memory.totalJSHeapSize) : null,
          canvasWidth: canvas?.width ?? 0,
          canvasHeight: canvas?.height ?? 0,
          dpr: window.devicePixelRatio || 1,
        });
        frames = 0;
        frameMsTotal = 0;
        lastPublishTime = now;
      }

      frame = requestAnimationFrame(sample);
    };

    frame = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(frame);
  }, [active, canvasRef, metricsRef]);

  return stats;
}

function appendGraphSample<T>(history: T[], sample: T) {
  const next = [...history, sample];
  return next.length > 80 ? next.slice(next.length - 80) : next;
}

function bytesToMegabytes(bytes: number) {
  return bytes / 1024 / 1024;
}
