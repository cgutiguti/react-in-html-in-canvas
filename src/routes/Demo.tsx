import { useEffect, useState } from "react";
import { DebugOverlay } from "../components/demo/DebugOverlay";
import { ProjectedPanel } from "../components/demo/ProjectedPanel";
import { ViewportGizmo } from "../components/demo/ViewportGizmo";
import { useHtmlInCanvasController } from "../lib/useHtmlInCanvasController";
import { usePerformanceStats } from "../lib/usePerformanceStats";

const panelSize = { width: 1400, height: 875 };
const panelCss = `
* { box-sizing: border-box; }
body { margin: 0; }
button, input, textarea, select { font: inherit; margin: 0; }
button { appearance: none; -webkit-appearance: none; }
.demo-panel {
  width: 1400px;
  height: 875px;
  padding: 0;
  color: #09090b;
  font-family: "Inter", "Geist", "SF Pro Display", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #ffffff;
  font-size: 14px;
  line-height: 1.35;
  overflow: hidden;
}
.demo-stage {
  width: 1240px;
  margin: 52px auto 0;
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
  } = useHtmlInCanvasController({ panelCss, panelSize });
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
          style={{ width: panelSize.width, height: panelSize.height }}
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
