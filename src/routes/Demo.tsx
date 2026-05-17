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
const CANARY_DOWNLOAD_URL = "https://www.google.com/chrome/canary/";
const CANVAS_DRAW_ELEMENT_FLAG_URL = "chrome://flags/#enable-canvas-draw-element";
const EXPERIMENTAL_WEB_PLATFORM_FLAG_URL = "chrome://flags/#enable-experimental-web-platform-features";
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
  const htmlInCanvasSupport = getHtmlInCanvasSupport();
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

  if (!htmlInCanvasSupport.supported) {
    return <HtmlInCanvasSetup missingFeatures={htmlInCanvasSupport.missingFeatures} />;
  }

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

function HtmlInCanvasSetup({ missingFeatures }: { missingFeatures: string[] }) {
  return (
    <main className="grid min-h-screen place-items-center bg-zinc-100 p-6 text-slate-950">
      <section className="max-w-2xl border border-slate-300 bg-white p-8 shadow-sm">
        <p className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">HTML-in-Canvas is not available</p>
        <h1 className="text-3xl font-semibold tracking-tight">This demo needs Chrome Canary with the experimental canvas DOM flags enabled.</h1>
        <p className="mt-4 text-base leading-7 text-slate-700">
          The page uses <code className="bg-slate-100 px-1 py-0.5">layoutsubtree</code>,{" "}
          <code className="bg-slate-100 px-1 py-0.5">requestPaint()</code>, and{" "}
          <code className="bg-slate-100 px-1 py-0.5">texElementImage2D()</code> to render live DOM into WebGL. Your current browser is
          missing: {missingFeatures.join(", ")}.
        </p>
        <ol className="mt-6 list-decimal space-y-3 pl-5 text-sm leading-6 text-slate-700">
          <li>
            Download and run{" "}
            <a className="font-medium text-slate-950 underline underline-offset-4" href={CANARY_DOWNLOAD_URL}>
              Chrome Canary
            </a>
            .
          </li>
          <li>
            In Canary, open <code className="bg-slate-100 px-1 py-0.5">{CANVAS_DRAW_ELEMENT_FLAG_URL}</code>, enable it, and restart.
          </li>
          <li>
            If the APIs are still missing, also enable{" "}
            <code className="bg-slate-100 px-1 py-0.5">{EXPERIMENTAL_WEB_PLATFORM_FLAG_URL}</code>, then restart Canary again.
          </li>
        </ol>
      </section>
    </main>
  );
}

function getHtmlInCanvasSupport() {
  if (typeof document === "undefined") {
    return { supported: false, missingFeatures: ["browser DOM"] };
  }

  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl");
  const missingFeatures = [
    "layoutsubtree",
    "requestPaint()",
    "captureElementImage()",
    "texElementImage2D()",
  ].filter((feature) => {
    switch (feature) {
      case "layoutsubtree":
        return !("layoutSubtree" in canvas) && !("layoutsubtree" in canvas);
      case "requestPaint()":
        return typeof canvas.requestPaint !== "function";
      case "captureElementImage()":
        return typeof canvas.captureElementImage !== "function";
      case "texElementImage2D()":
        return !gl || typeof gl.texElementImage2D !== "function";
      default:
        return true;
    }
  });

  return { supported: missingFeatures.length === 0, missingFeatures };
}
