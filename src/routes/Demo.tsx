import { useEffect, useState } from "react";
import { DebugOverlay } from "../components/demo/DebugOverlay";
import { ProjectedPanel } from "../components/demo/ProjectedPanel";
import { ViewportGizmo } from "../components/demo/ViewportGizmo";
import { useHtmlInCanvasController } from "../lib/useHtmlInCanvasController";
import { usePerformanceStats } from "../lib/usePerformanceStats";
import { PROJECTED_PANEL_SIZE } from "../lib/config";

const PANEL_STAGE_WIDTH = 1240;
const PANEL_STAGE_TOP_MARGIN = 52;
const PANEL_BASE_FONT_SIZE = 14;
const PANEL_BASE_LINE_HEIGHT = 1.35;
const panelCss = `
* { box-sizing: border-box; }
body { margin: 0; }
button, input, textarea, select { font: inherit; margin: 0; }
button { appearance: none; -webkit-appearance: none; }
.demo-panel {
  width: ${PROJECTED_PANEL_SIZE.width}px;
  height: ${PROJECTED_PANEL_SIZE.height}px;
  padding: 0;
  color: #09090b;
  font-family: "Inter", "Geist", "SF Pro Display", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #ffffff;
  font-size: ${PANEL_BASE_FONT_SIZE}px;
  line-height: ${PANEL_BASE_LINE_HEIGHT};
  overflow: hidden;
}
.demo-stage {
  width: ${PANEL_STAGE_WIDTH}px;
  margin: ${PANEL_STAGE_TOP_MARGIN}px auto 0;
  display: block;
}
`;

export function Demo() {
  const [debugVisible, setDebugVisible] = useState(false);
  const [hitboxesVisible, setHitboxesVisible] = useState(false);
  const {
    canvasRef,
    projectionSourceRef,
    panelRef,
    engineRef,
    status,
    viewState,
    orbitFromGizmo,
    snapView,
    resetView,
    setHitMapVisible,
  } = useHtmlInCanvasController({ panelCss, panelSize: PROJECTED_PANEL_SIZE });
  const perfStats = usePerformanceStats(debugVisible, canvasRef, engineRef);

  useEffect(() => {
    setHitMapVisible(debugVisible && hitboxesVisible);
  }, [debugVisible, hitboxesVisible, setHitMapVisible]);

  return (
    <main className="min-h-screen bg-zinc-100 text-slate-950">
      <style>{panelCss}</style>
      <canvas ref={canvasRef} className="fixed inset-0 h-full w-full" aria-label="Projected DOM demo">
        <div
          ref={projectionSourceRef}
          className="projection-source pointer-events-none overflow-hidden"
          style={{ width: PROJECTED_PANEL_SIZE.width, height: PROJECTED_PANEL_SIZE.height }}
        >
          <ProjectedPanel panelRef={panelRef} />
        </div>
      </canvas>

      <DebugOverlay
        debugVisible={debugVisible}
        hitboxesVisible={hitboxesVisible}
        status={status}
        perfStats={perfStats}
        onDebugVisibleChange={setDebugVisible}
        onHitboxesVisibleChange={setHitboxesVisible}
      />
      <ViewportGizmo view={viewState} onOrbit={orbitFromGizmo} onSnap={snapView} onReset={resetView} />
    </main>
  );
}
