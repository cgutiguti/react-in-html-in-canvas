import { Crosshair } from "lucide-react";
import { Button } from "../button";
import type { PerformanceStats } from "../../lib/usePerformanceStats";

const GRAPH_WIDTH = 264;
const GRAPH_HEIGHT = 56;
const GRAPH_MAX_MS = 40;
const GRAPH_HISTORY_LIMIT = 80;
const SIXTY_FPS_FRAME_MS = 16.67;
const THIRTY_FPS_FRAME_MS = 33.33;

export function DebugOverlay({
  debugVisible,
  hitboxesVisible,
  status,
  perfStats,
  onDebugVisibleChange,
  onHitboxesVisibleChange,
}: {
  debugVisible: boolean;
  hitboxesVisible: boolean;
  status: string;
  perfStats: PerformanceStats;
  onDebugVisibleChange: (visible: boolean) => void;
  onHitboxesVisibleChange: (visible: boolean) => void;
}) {
  return (
    <div className="pointer-events-none fixed bottom-5 left-5 z-10 flex max-w-[calc(100vw-40px)] flex-col items-start gap-2 text-sm text-slate-700">
      {debugVisible && <PerformancePanel stats={perfStats} />}
      <div className="pointer-events-auto flex max-w-full items-center gap-2">
        <Button
          className="rounded-none"
          variant={debugVisible ? "default" : "secondary"}
          onClick={() => onDebugVisibleChange(!debugVisible)}
        >
          debug
        </Button>
        {debugVisible && (
          <>
            <Button className="rounded-none" variant="secondary" onClick={() => onHitboxesVisibleChange(!hitboxesVisible)}>
              <Crosshair className="h-4 w-4" />
              {hitboxesVisible ? "hide" : "show"} projected hit map
            </Button>
            <div
              className="max-w-[48rem] overflow-hidden truncate whitespace-nowrap bg-slate-950/85 px-3 py-2 font-mono text-xs text-cyan-100"
              title={status}
            >
              {status}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PerformancePanel({ stats }: { stats: PerformanceStats }) {
  return (
    <div className="pointer-events-none w-80 border border-slate-800/70 bg-slate-950/85 p-3 font-mono text-xs text-cyan-100 shadow-xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wide text-cyan-300/80">
        <span>performance</span>
        <span>{stats.dpr.toFixed(2)} dpr</span>
      </div>
      <PerfGraph cpuHistory={stats.cpuHistory} gpuHistory={stats.gpuHistory} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-slate-400">fps</span>
        <strong className="text-right font-semibold text-cyan-50">{stats.fps}</strong>
        <span className="text-slate-400">raf frame</span>
        <strong className="text-right font-semibold text-cyan-50">{stats.frameMs.toFixed(1)} ms</strong>
        <span className="text-slate-400">cpu render</span>
        <strong className="text-right font-semibold text-cyan-50">{stats.cpuRenderMs.toFixed(1)} ms</strong>
        <span className="text-slate-400">gpu render</span>
        <strong className="text-right font-semibold text-amber-200">{formatMilliseconds(stats.gpuRenderMs)}</strong>
        <span className="text-slate-400">heap</span>
        <strong className="whitespace-nowrap text-right font-semibold text-cyan-50">
          {formatMegabytes(stats.heapUsedMb)} / {formatMegabytes(stats.heapTotalMb)}
        </strong>
        <span className="text-slate-400">canvas</span>
        <strong className="text-right font-semibold text-cyan-50">
          {stats.canvasWidth}x{stats.canvasHeight}
        </strong>
      </div>
    </div>
  );
}

function PerfGraph({
  cpuHistory,
  gpuHistory,
}: {
  cpuHistory: number[];
  gpuHistory: Array<number | null>;
}) {
  const cpuPath = createGraphPath(cpuHistory, GRAPH_WIDTH, GRAPH_HEIGHT, GRAPH_MAX_MS);
  const gpuPath = createGraphPath(gpuHistory, GRAPH_WIDTH, GRAPH_HEIGHT, GRAPH_MAX_MS);

  return (
    <div className="mb-3 border border-slate-700/80 bg-slate-950/70 p-2">
      <svg className="block h-14 w-full" viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`} role="img" aria-label="CPU and GPU frame time graph">
        <line x1="0" y1={GRAPH_HEIGHT - (SIXTY_FPS_FRAME_MS / GRAPH_MAX_MS) * GRAPH_HEIGHT} x2={GRAPH_WIDTH} y2={GRAPH_HEIGHT - (SIXTY_FPS_FRAME_MS / GRAPH_MAX_MS) * GRAPH_HEIGHT} stroke="rgba(148,163,184,.28)" strokeWidth="1" />
        <line x1="0" y1={GRAPH_HEIGHT - (THIRTY_FPS_FRAME_MS / GRAPH_MAX_MS) * GRAPH_HEIGHT} x2={GRAPH_WIDTH} y2={GRAPH_HEIGHT - (THIRTY_FPS_FRAME_MS / GRAPH_MAX_MS) * GRAPH_HEIGHT} stroke="rgba(148,163,184,.18)" strokeWidth="1" />
        {cpuPath && <path d={cpuPath} fill="none" stroke="#67e8f9" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
        {gpuPath && <path d={gpuPath} fill="none" stroke="#fbbf24" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="mt-1 flex items-center gap-3 text-[10px] uppercase tracking-wide">
        <span className="text-cyan-200">cpu</span>
        <span className="text-amber-200">gpu</span>
        <span className="ml-auto text-slate-500">16 / 33 ms</span>
      </div>
    </div>
  );
}

function createGraphPath(history: Array<number | null>, width: number, height: number, maxMs: number) {
  const samples = history.slice(-GRAPH_HISTORY_LIMIT);
  const step = samples.length > 1 ? width / (samples.length - 1) : width;
  let path = "";
  let drawing = false;

  samples.forEach((value, index) => {
    if (value === null) {
      drawing = false;
      return;
    }
    const x = index * step;
    const y = height - Math.min(maxMs, Math.max(0, value)) / maxMs * height;
    path += `${drawing ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    drawing = true;
  });

  return path;
}

function formatMegabytes(value: number | null) {
  return value === null ? "n/a" : `${value.toFixed(1)} mb`;
}

function formatMilliseconds(value: number | null) {
  return value === null ? "n/a" : `${value.toFixed(1)} ms`;
}
