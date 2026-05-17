import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { ArrowLeft, Crosshair } from "lucide-react";
import { Button } from "../components/button";
import { describeTarget } from "../projection/domHitTest";
import { HtmlToCanvasTexture } from "../projection/htmlToCanvasTexture";
import { createProjectedDomViewport, type ProjectedDomViewport } from "../projection/projectedDomViewport";

type PanelState = {
  theme: "cyan" | "rose" | "gold";
  intensity: number;
  message: string;
  counter: number;
  dragX: number;
};

type LightingSettings = {
  ambient: number;
  leftDiffuse: number;
  leftLightX: number;
  leftLightY: number;
  leftLightZ: number;
  rightDiffuse: number;
  rightLightX: number;
  rightLightY: number;
  rightLightZ: number;
  topDiffuse: number;
  topLightX: number;
  topLightY: number;
  topLightZ: number;
  shadowStrength: number;
  shadowBias: number;
};

type Engine = {
  render(): void;
  resize(): void;
  dispose(): void;
  uploadDomTexture(): boolean;
  requestNativePaint(): void;
  pick(clientX: number, clientY: number): { u: number; v: number; receiverId: number } | null;
  orbit(dx: number, dy: number): void;
  zoom(deltaY: number): void;
  setSceneMesh(sceneMesh: SceneMeshData): void;
  setHitMapVisible(visible: boolean): void;
  setLighting(settings: LightingSettings): void;
};

const panelSize = { width: 360, height: 260 };
const initialLighting: LightingSettings = {
  ambient: 0.819,
  leftDiffuse: 0.12,
  leftLightX: -3.8,
  leftLightY: 2.35,
  leftLightZ: 17.35,
  rightDiffuse: 0.12,
  rightLightX: 5.5,
  rightLightY: 2.35,
  rightLightZ: 17.35,
  topDiffuse: 0.12,
  topLightX: 0.6,
  topLightY: 8,
  topLightZ: -2.35,
  shadowStrength: 0.02,
  shadowBias: 0.008,
};
type ProjectedPick = { u: number; v: number; receiverId: number };
type SceneMeshData = { vertices: Float32Array; indices: Uint16Array | Uint32Array };

const panelCss = `
* { box-sizing: border-box; }
body { margin: 0; }
button, input { font: inherit; margin: 0; }
button { appearance: none; -webkit-appearance: none; }
.raw-projector-panel {
  width: 360px;
  height: 260px;
  padding: 8px;
  color: #06111f;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: transparent;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: 66px 64px 46px 46px;
  gap: 8px;
}
.raw-title {
  grid-column: 1 / 4;
  align-self: end;
  margin: 0;
  color: #0f172a;
  font-size: 42px;
  font-weight: 950;
  letter-spacing: 0;
  line-height: .86;
  text-transform: lowercase;
}
.raw-caption {
  grid-column: 1 / 4;
  margin: -4px 0 0;
  color: rgba(15,23,42,.62);
  font-size: 13px;
  font-weight: 850;
  line-height: 1.05;
}
.raw-grid { grid-column: 1 / 4; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.raw-grid button {
  height: 56px;
  border-radius: 0;
  border: 2px solid rgba(15,23,42,.34);
  background: rgba(255,255,255,.42);
  color: #06111f;
  font-size: 18px;
  font-weight: 950;
  text-transform: lowercase;
}
.raw-grid button[data-active="true"] { background: #06111f; color: #f8fafc; }
.raw-field {
  display: grid;
  gap: 4px;
  min-width: 0;
  font-size: 11px;
  font-weight: 900;
  color: rgba(15,23,42,.76);
  text-transform: lowercase;
}
.raw-field span { display: flex; justify-content: space-between; }
.raw-field input[type="range"], .raw-field input[type="text"] { width: 100%; }
.raw-field input[type="text"] {
  height: 28px;
  border: 2px solid rgba(15,23,42,.28);
  border-radius: 0;
  padding: 0 8px;
  background: rgba(255,255,255,.5);
  color: #06111f;
  font-weight: 900;
}
.raw-drag {
  grid-column: 2 / 4;
  position: relative;
  height: 38px;
  margin-top: 0;
  border: 2px solid rgba(15,23,42,.28);
  border-radius: 0;
  background: rgba(255,255,255,.32);
  overflow: hidden;
  touch-action: none;
}
.raw-drag-handle {
  position: absolute;
  top: 5px;
  width: 52px;
  height: 24px;
  border-radius: 0;
  background: #06111f;
  color: white;
  display: grid;
  place-items: center;
  font-size: 10px;
  font-weight: 900;
  user-select: none;
}
`;

export function RawProjectorDemo() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const projectionSourceRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const textureRef = useRef<HtmlToCanvasTexture | null>(null);
  const viewportRef = useRef<ProjectedDomViewport | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const routingRef = useRef(false);
  const orbitRef = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });
  const [state, setState] = useState<PanelState>({
    theme: "cyan",
    intensity: 72,
    message: "normal React input",
    counter: 0,
    dragX: 46,
  });
  const [lighting, setLighting] = useState<LightingSettings>(initialLighting);
  const [hitboxesVisible, setHitboxesVisible] = useState(false);
  const [status, setStatus] = useState("raw WebGL renderer readying");

  useEffect(() => {
    const canvas = canvasRef.current;
    const projectionSource = projectionSourceRef.current;
    const panel = panelRef.current;
    if (!canvas || !projectionSource || !panel) return;

    const texture = new HtmlToCanvasTexture(panel, { ...panelSize, pixelRatio: 2 });
    textureRef.current = texture;
    viewportRef.current = createProjectedDomViewport(panel);
    canvas.setAttribute("layoutsubtree", "");
    canvas.layoutSubtree = true;
    const engine = createRawProjectorEngine(canvas, projectionSource, texture.canvas);
    engineRef.current = engine;
    let disposed = false;

    const updateTexture = () => {
      engine.requestNativePaint();
      if (engine.uploadDomTexture()) {
        engine.render();
        return;
      }
      void texture.update(panelCss).then(() => {
        if (disposed) return;
        engine.uploadDomTexture();
        engine.render();
      });
    };
    canvas.onpaint = () => {
      if (disposed) return;
      engine.uploadDomTexture();
      engine.render();
    };
    updateTexture();
    void loadOriginalProjectorModel().then((sceneMesh) => {
      if (disposed || engineRef.current !== engine) return;
      engine.setSceneMesh(sceneMesh);
      engine.render();
      setStatus("loaded original GLB geometry");
    }).catch((error) => {
      console.warn("[raw-projector] original GLB load failed; using procedural fallback", error);
      setStatus("using procedural fallback geometry");
    });

    let frame = 0;
    const renderLoop = () => {
      if (disposed) return;
      engine.render();
      frame = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    const onResize = () => {
      engine.resize();
      engine.render();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!event.isTrusted) return;
      const picked = engine.pick(event.clientX, event.clientY);
      if (picked) {
        routingRef.current = true;
        orbitRef.current.active = false;
        event.preventDefault();
        event.stopImmediatePropagation();
        routeProjectedEvent(event, picked);
        canvas.setPointerCapture?.(event.pointerId);
        return;
      }
      orbitRef.current = { active: true, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!event.isTrusted) return;
      if (routingRef.current) {
        const picked = engine.pick(event.clientX, event.clientY);
        if (picked) {
          event.preventDefault();
          event.stopImmediatePropagation();
          routeProjectedEvent(event, picked);
        }
        return;
      }
      const picked = engine.pick(event.clientX, event.clientY);
      if (picked) {
        orbitRef.current.active = false;
        routeProjectedEvent(event, picked);
        return;
      }
      viewportRef.current?.routePointerExit(event);
      if (orbitRef.current.active && event.buttons !== 0) {
        const dx = event.clientX - orbitRef.current.x;
        const dy = event.clientY - orbitRef.current.y;
        orbitRef.current = { active: true, x: event.clientX, y: event.clientY };
        engine.orbit(dx, dy);
      } else if (orbitRef.current.active && event.buttons === 0) {
        orbitRef.current.active = false;
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!event.isTrusted) return;
      if (routingRef.current) {
        const picked = engine.pick(event.clientX, event.clientY);
        if (picked) routeProjectedEvent(event, picked);
        viewportRef.current?.releasePointer(event.pointerId);
        routingRef.current = false;
        orbitRef.current.active = false;
        canvas.releasePointerCapture?.(event.pointerId);
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      orbitRef.current.active = false;
      canvas.releasePointerCapture?.(event.pointerId);
    };
    const onPointerCancel = (event: PointerEvent) => {
      if (!event.isTrusted) return;
      const picked = engine.pick(event.clientX, event.clientY);
      if (picked) routeProjectedEvent(event, picked);
      viewportRef.current?.releasePointer(event.pointerId);
      viewportRef.current?.routePointerExit(event);
      routingRef.current = false;
      orbitRef.current.active = false;
      canvas.releasePointerCapture?.(event.pointerId);
    };
    const onPointerLeave = (event: PointerEvent) => {
      if (!event.isTrusted) return;
      if (!routingRef.current) {
        viewportRef.current?.routePointerExit(event);
      }
      if (event.buttons === 0) {
        orbitRef.current.active = false;
      }
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.isTrusted) return;
      const picked = engine.pick(event.clientX, event.clientY);
      if (picked) {
        const hit = {
          u: picked.u,
          v: picked.v,
          x: picked.u * panelSize.width,
          y: (1 - picked.v) * panelSize.height,
        };
        const result = viewportRef.current?.routeWheel(event, hit);
        if (result?.consumed) {
          event.preventDefault();
          event.stopImmediatePropagation();
          setStatus(`wheel: ${Math.round(hit.x)}, ${Math.round(hit.y)} -> ${result.target ? describeTarget(result.target) : "projected panel"}`);
          updateTexture();
          return;
        }
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      engine.zoom(event.deltaY);
      engine.render();
      setStatus(`zoom: ${event.deltaY > 0 ? "out" : "in"}`);
    };

    function routeProjectedEvent(event: PointerEvent, picked: ProjectedPick) {
      const hit = {
        u: picked.u,
        v: picked.v,
        x: picked.u * panelSize.width,
        y: (1 - picked.v) * panelSize.height,
      };
      const result = viewportRef.current?.routePointer(event, hit);
      const target = result?.target ?? result?.captured ?? null;
      setStatus(
        `${event.type}: ${Math.round(hit.x)}, ${Math.round(hit.y)} receiver ${picked.receiverId}${
          target ? ` -> ${describeTarget(target)}` : " -> projected panel"
        }`,
      );
      updateTexture();
    }

    window.addEventListener("resize", onResize);
    canvas.addEventListener("pointerdown", onPointerDown, true);
    canvas.addEventListener("pointermove", onPointerMove, true);
    canvas.addEventListener("pointerup", onPointerUp, true);
    canvas.addEventListener("pointercancel", onPointerCancel, true);
    canvas.addEventListener("pointerleave", onPointerLeave, true);
    canvas.addEventListener("wheel", onWheel, { capture: true, passive: false });

    return () => {
      disposed = true;
      canvas.onpaint = null;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("pointerdown", onPointerDown, true);
      canvas.removeEventListener("pointermove", onPointerMove, true);
      canvas.removeEventListener("pointerup", onPointerUp, true);
      canvas.removeEventListener("pointercancel", onPointerCancel, true);
      canvas.removeEventListener("pointerleave", onPointerLeave, true);
      canvas.removeEventListener("wheel", onWheel, true);
      texture.dispose();
      engine.dispose();
      if (textureRef.current === texture) textureRef.current = null;
      if (engineRef.current === engine) engineRef.current = null;
      if (viewportRef.current?.getCapturedTarget()) viewportRef.current.releasePointer(0);
      if (viewportRef.current) viewportRef.current = null;
    };
  }, []);

  useEffect(() => {
    const texture = textureRef.current;
    const engine = engineRef.current;
    if (!texture || !engine) return;
    let cancelled = false;
    void texture.update(panelCss).then(() => {
      if (cancelled || engineRef.current !== engine) return;
      engine.uploadDomTexture();
      engine.render();
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

  useEffect(() => {
    engineRef.current?.setHitMapVisible(hitboxesVisible);
    engineRef.current?.render();
  }, [hitboxesVisible]);

  useEffect(() => {
    engineRef.current?.setLighting(lighting);
    engineRef.current?.render();
  }, [lighting]);

  return (
    <main className="min-h-screen bg-zinc-100 text-slate-950">
      <style>{panelCss}</style>
      <canvas ref={canvasRef} className="fixed inset-0 h-full w-full" aria-label="Raw WebGL projected DOM demo">
        <div ref={projectionSourceRef} className="projection-source h-[260px] w-[360px] overflow-hidden">
          <ProjectedPanel state={state} setState={setState} panelRef={panelRef} />
        </div>
      </canvas>

      <div className="pointer-events-none fixed left-5 top-5 z-10 text-sm text-slate-700">
        <div className="pointer-events-auto flex max-w-[calc(100vw-40px)] items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              window.history.pushState({}, "", "/three-projector");
              window.dispatchEvent(new PopStateEvent("popstate"));
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            Three route
          </Button>
          <Button variant="secondary" onClick={() => setHitboxesVisible((value) => !value)}>
            <Crosshair className="h-4 w-4" />
            {hitboxesVisible ? "hide" : "show"} projected hit map
          </Button>
          <div className="min-w-0 rounded-md bg-slate-950/85 px-3 py-2 font-mono text-xs text-cyan-100">{status}</div>
        </div>
      </div>
      <LightingPanel settings={lighting} onChange={setLighting} />
    </main>
  );
}

function LightingPanel({
  settings,
  onChange,
}: {
  settings: LightingSettings;
  onChange: React.Dispatch<React.SetStateAction<LightingSettings>>;
}) {
  return (
    <div className="fixed bottom-5 right-5 z-10 w-[300px] rounded-md border border-slate-200 bg-white/90 p-3 text-xs text-slate-800 shadow-lg backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">lighting</h2>
        <Button variant="secondary" onClick={() => onChange(initialLighting)}>
          reset
        </Button>
      </div>
      <LightingSlider label="ambient floor" min={0.8} max={1} step={0.001} value={settings.ambient} onChange={(ambient) => onChange((current) => ({ ...current, ambient }))} />
      <div className="mt-3 border-t border-slate-200 pt-3">
        <div className="mb-2 font-semibold text-slate-600">left camera light</div>
        <LightingSlider label="left gain" min={0} max={1.5} step={0.01} value={settings.leftDiffuse} onChange={(leftDiffuse) => onChange((current) => ({ ...current, leftDiffuse }))} />
        <LightingSlider label="left x" min={-8} max={8} step={0.05} value={settings.leftLightX} onChange={(leftLightX) => onChange((current) => ({ ...current, leftLightX }))} />
        <LightingSlider label="left y" min={-2} max={8} step={0.05} value={settings.leftLightY} onChange={(leftLightY) => onChange((current) => ({ ...current, leftLightY }))} />
        <LightingSlider label="left z" min={4} max={28} step={0.05} value={settings.leftLightZ} onChange={(leftLightZ) => onChange((current) => ({ ...current, leftLightZ }))} />
      </div>
      <div className="mt-3 border-t border-slate-200 pt-3">
        <div className="mb-2 font-semibold text-slate-600">right camera light</div>
        <LightingSlider label="right gain" min={0} max={1.5} step={0.01} value={settings.rightDiffuse} onChange={(rightDiffuse) => onChange((current) => ({ ...current, rightDiffuse }))} />
        <LightingSlider label="right x" min={-8} max={8} step={0.05} value={settings.rightLightX} onChange={(rightLightX) => onChange((current) => ({ ...current, rightLightX }))} />
        <LightingSlider label="right y" min={-2} max={8} step={0.05} value={settings.rightLightY} onChange={(rightLightY) => onChange((current) => ({ ...current, rightLightY }))} />
        <LightingSlider label="right z" min={4} max={28} step={0.05} value={settings.rightLightZ} onChange={(rightLightZ) => onChange((current) => ({ ...current, rightLightZ }))} />
      </div>
      <div className="mt-3 border-t border-slate-200 pt-3">
        <div className="mb-2 font-semibold text-slate-600">top light</div>
        <LightingSlider label="top gain" min={0} max={1.5} step={0.01} value={settings.topDiffuse} onChange={(topDiffuse) => onChange((current) => ({ ...current, topDiffuse }))} />
        <LightingSlider label="top x" min={-8} max={8} step={0.05} value={settings.topLightX} onChange={(topLightX) => onChange((current) => ({ ...current, topLightX }))} />
        <LightingSlider label="top y" min={-2} max={12} step={0.05} value={settings.topLightY} onChange={(topLightY) => onChange((current) => ({ ...current, topLightY }))} />
        <LightingSlider label="top z" min={-8} max={8} step={0.05} value={settings.topLightZ} onChange={(topLightZ) => onChange((current) => ({ ...current, topLightZ }))} />
      </div>
      <div className="mt-3 border-t border-slate-200 pt-3">
        <div className="mb-2 font-semibold text-slate-600">shadow map</div>
        <LightingSlider label="shadow strength" min={0} max={0.9} step={0.01} value={settings.shadowStrength} onChange={(shadowStrength) => onChange((current) => ({ ...current, shadowStrength }))} />
        <LightingSlider label="shadow bias" min={0} max={0.04} step={0.001} value={settings.shadowBias} onChange={(shadowBias) => onChange((current) => ({ ...current, shadowBias }))} />
      </div>
    </div>
  );
}

function LightingSlider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="mb-2 grid gap-1">
      <span className="flex justify-between font-medium">
        {label}
        <strong>{value.toFixed(step < 0.01 ? 3 : 2)}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ProjectedPanel({
  state,
  setState,
  panelRef,
}: {
  state: PanelState;
  setState: React.Dispatch<React.SetStateAction<PanelState>>;
  panelRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={panelRef} className="raw-projector-panel">
      <h2 className="raw-title" style={{ color: state.theme === "rose" ? "#9f1239" : state.theme === "gold" ? "#92400e" : "#155e75" }}>
        projected react
      </h2>
      <p className="raw-caption">live controls scattered across white geometry</p>
      <div className="raw-grid">
        {(["cyan", "rose", "gold"] as const).map((theme) => (
          <button
            key={theme}
            type="button"
            data-active={state.theme === theme}
            onClick={() => setState((current) => ({ ...current, theme, counter: current.counter + 1 }))}
          >
            {theme}
          </button>
        ))}
      </div>
      <label className="raw-field">
        <span>
          intensity <strong>{state.intensity}</strong>
        </span>
        <input
          type="range"
          min="0"
          max="100"
          value={state.intensity}
          onChange={(event) => setState((current) => ({ ...current, intensity: Number(event.target.value) }))}
        />
      </label>
      <label className="raw-field">
        message
        <input
          type="text"
          value={state.message}
          onChange={(event) => setState((current) => ({ ...current, message: event.target.value }))}
        />
      </label>
      <label className="raw-field">
        clicks
        <strong>{state.counter}</strong>
      </label>
      <div
        className="raw-drag"
        onPointerMove={(event) => {
          if (event.buttons !== 1) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const next = Math.min(rect.width - 52, Math.max(0, event.clientX - rect.left - 26));
          setState((current) => ({ ...current, dragX: next }));
        }}
      >
        <div className="raw-drag-handle" style={{ left: state.dragX }}>
          drag
        </div>
      </div>
    </div>
  );
}

function createRawProjectorEngine(
  canvas: HTMLCanvasElement,
  domElement: HTMLElement,
  fallbackCanvas: HTMLCanvasElement,
): Engine {
  const context = canvas.getContext("webgl", { antialias: true, alpha: false });
  if (!context) throw new Error("WebGL is not available.");
  const gl: WebGLRenderingContext = context;
  gl.getExtension("OES_element_index_uint");

  const program = createProgram(gl, vertexShader, fragmentShader);
  const pickProgram = createProgram(gl, vertexShader, pickFragmentShader);
  const receiverPickProgram = createProgram(gl, receiverPickVertexShader, receiverPickFragmentShader);
  const shadowProgram = createProgram(gl, shadowVertexShader, shadowFragmentShader);
  let mesh = createSceneMesh(gl);
  const domTexture = gl.createTexture();
  const pickTexture = gl.createTexture();
  const pickDepth = gl.createRenderbuffer();
  const pickFramebuffer = gl.createFramebuffer();
  const shadowTexture = gl.createTexture();
  const shadowDepth = gl.createRenderbuffer();
  const shadowFramebuffer = gl.createFramebuffer();
  const shadowMapSize = 2048;
  if (!domTexture || !pickTexture || !pickDepth || !pickFramebuffer || !shadowTexture || !shadowDepth || !shadowFramebuffer) {
    throw new Error("Could not allocate raw projector GL resources.");
  }

  let width = 1;
  let height = 1;
  let yaw = 0;
  let pitch = 0;
  let hitMapVisible = true;
  const projectorTarget = [0.6, -2.35, -2.35] as Vec3;
  const projectorEye = [0, 0, 15] as Vec3;
  const initialViewRadius = length(subtract(projectorEye, projectorTarget));
  let viewRadius = initialViewRadius;
  const uvFit = { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 };
  const view = mat4();
  const projection = mat4();
  const viewProjection = mat4();
  const projectorViewProjection = mat4();
  const shadowViewProjection = mat4();
  let lightingSettings = { ...initialLighting };

  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.clearColor(1, 1, 1, 1);
  gl.bindTexture(gl.TEXTURE_2D, domTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, shadowTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, shadowMapSize, shadowMapSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindRenderbuffer(gl.RENDERBUFFER, shadowDepth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, shadowMapSize, shadowMapSize);
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFramebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shadowTexture, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, shadowDepth);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  function updateMatrices() {
    const baseDirection = subtract(projectorEye, projectorTarget);
    const normalizedBase = normalize(baseDirection);
    const baseYaw = Math.atan2(normalizedBase[0], normalizedBase[2]);
    const basePitch = Math.asin(normalizedBase[1]);
    const orbitYaw = baseYaw + yaw;
    const orbitPitch = Math.max(-1.2, Math.min(1.2, basePitch + pitch));
    const eye: Vec3 = [
      projectorTarget[0] + Math.sin(orbitYaw) * Math.cos(orbitPitch) * viewRadius,
      projectorTarget[1] + Math.sin(orbitPitch) * viewRadius,
      projectorTarget[2] + Math.cos(orbitYaw) * Math.cos(orbitPitch) * viewRadius,
    ];
    perspective(projection, radians(45), width / height, 0.1, 100);
    lookAt(view, eye, projectorTarget, [0, 1, 0]);
    multiply(viewProjection, projection, view);

    const projectorView = mat4();
    const projectorProjection = mat4();
    lookAt(projectorView, projectorEye, projectorTarget, [0, 1, 0]);
    perspective(projectorProjection, radians(14), width / height, 1, 100);
    multiply(projectorViewProjection, projectorProjection, projectorView);

    const topLight = normalize([lightingSettings.topLightX, lightingSettings.topLightY, lightingSettings.topLightZ]);
    const shadowView = mat4();
    const shadowProjection = mat4();
    const shadowEye = add(projectorTarget, scale(topLight, 22));
    const shadowUp: Vec3 = Math.abs(topLight[1]) > 0.9 ? [0, 0, -1] : [0, 1, 0];
    lookAt(shadowView, shadowEye, projectorTarget, shadowUp);
    orthographic(shadowProjection, -9.5, 9.5, -7.5, 7.5, 0.1, 45);
    multiply(shadowViewProjection, shadowProjection, shadowView);
  }

  function updateUvFit() {
    const panelAspect = panelSize.width / panelSize.height;
    const bufferAspect = width / height;
    if (bufferAspect > panelAspect) {
      uvFit.scaleX = panelAspect / bufferAspect;
      uvFit.scaleY = 1;
      uvFit.offsetX = (1 - uvFit.scaleX) / 2;
      uvFit.offsetY = 0;
    } else {
      uvFit.scaleX = 1;
      uvFit.scaleY = bufferAspect / panelAspect;
      uvFit.offsetX = 0;
      uvFit.offsetY = (1 - uvFit.scaleY) / 2;
    }
  }

  function bindMeshAttributes(targetProgram: WebGLProgram) {
    for (let index = 0; index < 8; index += 1) {
      gl.disableVertexAttribArray(index);
    }
    const position = gl.getAttribLocation(targetProgram, "aPosition");
    const normal = gl.getAttribLocation(targetProgram, "aNormal");
    const receiverId = gl.getAttribLocation(targetProgram, "aReceiverId");
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertexBuffer);
    if (position >= 0) {
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 28, 0);
    }
    if (normal >= 0) {
      gl.enableVertexAttribArray(normal);
      gl.vertexAttribPointer(normal, 3, gl.FLOAT, false, 28, 12);
    }
    if (receiverId >= 0) {
      gl.enableVertexAttribArray(receiverId);
      gl.vertexAttribPointer(receiverId, 1, gl.FLOAT, false, 28, 24);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
  }

  function draw(targetProgram: WebGLProgram, pickPass: boolean) {
    gl.useProgram(targetProgram);
    bindMeshAttributes(targetProgram);
    gl.uniformMatrix4fv(gl.getUniformLocation(targetProgram, "uViewProjection"), false, viewProjection);
    gl.uniformMatrix4fv(gl.getUniformLocation(targetProgram, "uProjectorViewProjection"), false, projectorViewProjection);
    gl.uniformMatrix4fv(gl.getUniformLocation(targetProgram, "uShadowViewProjection"), false, shadowViewProjection);
    const uvFitLocation = gl.getUniformLocation(targetProgram, "uProjectorUvFit");
    if (uvFitLocation) {
      gl.uniform4f(uvFitLocation, uvFit.offsetX, uvFit.offsetY, uvFit.scaleX, uvFit.scaleY);
    }
    const leftLightLocation = gl.getUniformLocation(targetProgram, "uLeftLight");
    if (leftLightLocation) {
      gl.uniform3fv(leftLightLocation, normalize(subtract([lightingSettings.leftLightX, lightingSettings.leftLightY, lightingSettings.leftLightZ], projectorTarget)));
    }
    const rightLightLocation = gl.getUniformLocation(targetProgram, "uRightLight");
    if (rightLightLocation) {
      gl.uniform3fv(rightLightLocation, normalize(subtract([lightingSettings.rightLightX, lightingSettings.rightLightY, lightingSettings.rightLightZ], projectorTarget)));
    }
    const topLightLocation = gl.getUniformLocation(targetProgram, "uTopLight");
    if (topLightLocation) {
      gl.uniform3fv(topLightLocation, normalize(subtract([lightingSettings.topLightX, lightingSettings.topLightY, lightingSettings.topLightZ], projectorTarget)));
    }
    const ambientLocation = gl.getUniformLocation(targetProgram, "uAmbientFloor");
    if (ambientLocation) gl.uniform1f(ambientLocation, lightingSettings.ambient);
    const leftDiffuseLocation = gl.getUniformLocation(targetProgram, "uLeftDiffuseGain");
    if (leftDiffuseLocation) gl.uniform1f(leftDiffuseLocation, lightingSettings.leftDiffuse);
    const rightDiffuseLocation = gl.getUniformLocation(targetProgram, "uRightDiffuseGain");
    if (rightDiffuseLocation) gl.uniform1f(rightDiffuseLocation, lightingSettings.rightDiffuse);
    const topDiffuseLocation = gl.getUniformLocation(targetProgram, "uTopDiffuseGain");
    if (topDiffuseLocation) gl.uniform1f(topDiffuseLocation, lightingSettings.topDiffuse);
    const shadowStrengthLocation = gl.getUniformLocation(targetProgram, "uShadowStrength");
    if (shadowStrengthLocation) gl.uniform1f(shadowStrengthLocation, lightingSettings.shadowStrength);
    const shadowBiasLocation = gl.getUniformLocation(targetProgram, "uShadowBias");
    if (shadowBiasLocation) gl.uniform1f(shadowBiasLocation, lightingSettings.shadowBias);
    const textureLocation = gl.getUniformLocation(targetProgram, "uDomTexture");
    if (textureLocation) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, domTexture);
      gl.uniform1i(textureLocation, 0);
    }
    const shadowTextureLocation = gl.getUniformLocation(targetProgram, "uShadowMap");
    if (shadowTextureLocation) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, shadowTexture);
      gl.uniform1i(shadowTextureLocation, 1);
    }
    const hitLocation = gl.getUniformLocation(targetProgram, "uShowHitMap");
    if (hitLocation) gl.uniform1f(hitLocation, !pickPass && hitMapVisible ? 1 : 0);
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, mesh.indexType, 0);
  }

  function renderShadowMap() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFramebuffer);
    gl.viewport(0, 0, shadowMapSize, shadowMapSize);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(shadowProgram);
    bindMeshAttributes(shadowProgram);
    gl.uniformMatrix4fv(gl.getUniformLocation(shadowProgram, "uShadowViewProjection"), false, shadowViewProjection);
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, mesh.indexType, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function resizePickTarget() {
    gl.bindTexture(gl.TEXTURE_2D, pickTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindRenderbuffer(gl.RENDERBUFFER, pickDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, pickFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pickTexture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, pickDepth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  const engine: Engine = {
    render() {
      updateMatrices();
      renderShadowMap();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(1, 1, 1, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.viewport(0, 0, width, height);
      draw(program, false);
    },
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width * dpr));
      height = Math.max(1, Math.round(rect.height * dpr));
      canvas.width = width;
      canvas.height = height;
      updateUvFit();
      resizePickTarget();
    },
    uploadDomTexture() {
      gl.bindTexture(gl.TEXTURE_2D, domTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      if (gl.texElementImage2D) {
        try {
          gl.texElementImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, domElement);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!message.includes("No cached paint record")) {
            console.warn("[raw-projector] native element texture upload failed; falling back to SVG raster texture", error);
          }
        }
      }
      if (fallbackCanvas.width <= 0 || fallbackCanvas.height <= 0) {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        return false;
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fallbackCanvas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      return true;
    },
    requestNativePaint() {
      canvas.requestPaint?.();
    },
    pick(clientX, clientY) {
      updateMatrices();
      gl.bindFramebuffer(gl.FRAMEBUFFER, pickFramebuffer);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      draw(pickProgram, true);
      const rect = canvas.getBoundingClientRect();
      const x = Math.min(width - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * width)));
      const y = Math.min(height - 1, Math.max(0, Math.floor((1 - (clientY - rect.top) / rect.height) * height)));
      const pixel = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      draw(receiverPickProgram, true);
      const receiverPixel = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, receiverPixel);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (pixel[0] === 0 && pixel[1] === 0 && pixel[2] === 0 && pixel[3] === 0) return null;
      return {
        u: decode16(pixel[0], pixel[1]),
        v: decode16(pixel[2], pixel[3]),
        receiverId: receiverPixel[0],
      };
    },
    orbit(dx, dy) {
      yaw += dx * 0.006;
      pitch = Math.max(-0.7, Math.min(0.75, pitch + dy * 0.006));
    },
    zoom(deltaY) {
      const scale = Math.exp(deltaY * 0.0012);
      viewRadius = Math.max(4, Math.min(36, viewRadius * scale));
    },
    setSceneMesh(sceneMesh) {
      gl.deleteBuffer(mesh.vertexBuffer);
      gl.deleteBuffer(mesh.indexBuffer);
      mesh = uploadSceneMesh(gl, sceneMesh);
    },
    setHitMapVisible(visible) {
      hitMapVisible = visible;
    },
    setLighting(settings) {
      lightingSettings = { ...settings };
    },
    dispose() {
      gl.deleteProgram(program);
      gl.deleteProgram(pickProgram);
      gl.deleteProgram(receiverPickProgram);
      gl.deleteProgram(shadowProgram);
      gl.deleteBuffer(mesh.vertexBuffer);
      gl.deleteBuffer(mesh.indexBuffer);
      gl.deleteTexture(domTexture);
      gl.deleteTexture(pickTexture);
      gl.deleteTexture(shadowTexture);
      gl.deleteRenderbuffer(pickDepth);
      gl.deleteRenderbuffer(shadowDepth);
      gl.deleteFramebuffer(pickFramebuffer);
      gl.deleteFramebuffer(shadowFramebuffer);
    },
  };
  engine.resize();
  return engine;
}

const vertexShader = `
attribute vec3 aPosition;
attribute vec3 aNormal;
uniform mat4 uViewProjection;
uniform mat4 uProjectorViewProjection;
uniform mat4 uShadowViewProjection;
varying vec3 vNormal;
varying vec4 vProjected;
varying vec4 vShadowCoord;
void main() {
  vec4 world = vec4(aPosition, 1.0);
  vNormal = normalize(aNormal);
  vProjected = uProjectorViewProjection * world;
  vShadowCoord = uShadowViewProjection * world;
  gl_Position = uViewProjection * world;
}
`;

const fragmentShader = `
precision mediump float;
uniform sampler2D uDomTexture;
uniform sampler2D uShadowMap;
uniform vec3 uLeftLight;
uniform vec3 uRightLight;
uniform vec3 uTopLight;
uniform float uAmbientFloor;
uniform float uLeftDiffuseGain;
uniform float uRightDiffuseGain;
uniform float uTopDiffuseGain;
uniform float uShadowStrength;
uniform float uShadowBias;
uniform float uShowHitMap;
uniform vec4 uProjectorUvFit;
varying vec3 vNormal;
varying vec4 vProjected;
varying vec4 vShadowCoord;
float decodeDepth(vec4 rgbaDepth) {
  return dot(rgbaDepth, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0));
}
void main() {
  vec3 ndc = vProjected.xyz / vProjected.w;
  vec2 rawUv = ndc.xy * 0.5 + 0.5;
  vec2 uv = (rawUv - uProjectorUvFit.xy) / uProjectorUvFit.zw;
  float insideRaw =
    step(uProjectorUvFit.x, rawUv.x) * step(rawUv.x, uProjectorUvFit.x + uProjectorUvFit.z) *
    step(uProjectorUvFit.y, rawUv.y) * step(rawUv.y, uProjectorUvFit.y + uProjectorUvFit.w);
  float inside = insideRaw * step(-1.0, ndc.z) * step(ndc.z, 1.0);
  float leftDiffuse = max(dot(normalize(vNormal), uLeftLight), 0.0);
  float rightDiffuse = max(dot(normalize(vNormal), uRightLight), 0.0);
  float topDiffuse = max(dot(normalize(vNormal), uTopLight), 0.0);
  vec3 base = min(vec3(1.0), vec3(uAmbientFloor + leftDiffuse * uLeftDiffuseGain + rightDiffuse * uRightDiffuseGain + topDiffuse * uTopDiffuseGain));
  vec3 shadowNdc = vShadowCoord.xyz / vShadowCoord.w;
  vec2 shadowUv = shadowNdc.xy * 0.5 + 0.5;
  float shadowInside = step(0.0, shadowUv.x) * step(shadowUv.x, 1.0) * step(0.0, shadowUv.y) * step(shadowUv.y, 1.0) * step(-1.0, shadowNdc.z) * step(shadowNdc.z, 1.0);
  float currentDepth = shadowNdc.z * 0.5 + 0.5;
  float storedDepth = decodeDepth(texture2D(uShadowMap, shadowUv));
  float shadowed = step(storedDepth + uShadowBias, currentDepth) * shadowInside;
  base *= 1.0 - shadowed * uShadowStrength;
  vec4 projected = texture2D(uDomTexture, uv);
  vec3 color = mix(base, projected.rgb, projected.a * inside);
  if (uShowHitMap > 0.5 && inside > 0.5 && projected.a > 0.08) {
    color = mix(color, vec3(1.0, 0.84, 0.08), 0.22);
  }
  gl_FragColor = vec4(color, 1.0);
}
`;

const pickFragmentShader = `
precision mediump float;
uniform vec4 uProjectorUvFit;
varying vec4 vProjected;
vec2 encode16(float value) {
  float encodedValue = floor(clamp(value, 0.0, 1.0) * 65534.0) + 1.0;
  return vec2(floor(encodedValue / 256.0), mod(encodedValue, 256.0)) / 255.0;
}
void main() {
  vec3 ndc = vProjected.xyz / vProjected.w;
  vec2 rawUv = ndc.xy * 0.5 + 0.5;
  vec2 uv = (rawUv - uProjectorUvFit.xy) / uProjectorUvFit.zw;
  bool inside =
    rawUv.x >= uProjectorUvFit.x &&
    rawUv.x <= uProjectorUvFit.x + uProjectorUvFit.z &&
    rawUv.y >= uProjectorUvFit.y &&
    rawUv.y <= uProjectorUvFit.y + uProjectorUvFit.w &&
    ndc.z >= -1.0 &&
    ndc.z <= 1.0;
  if (!inside) discard;
  vec2 encodedU = encode16(uv.x);
  vec2 encodedV = encode16(uv.y);
  gl_FragColor = vec4(encodedU.x, encodedU.y, encodedV.x, encodedV.y);
}
`;

const receiverPickVertexShader = `
attribute vec3 aPosition;
attribute float aReceiverId;
uniform mat4 uViewProjection;
varying float vReceiverId;
void main() {
  vReceiverId = aReceiverId;
  gl_Position = uViewProjection * vec4(aPosition, 1.0);
}
`;

const receiverPickFragmentShader = `
precision mediump float;
varying float vReceiverId;
void main() {
  gl_FragColor = vec4(vReceiverId / 255.0, 0.0, 0.0, 1.0);
}
`;

const shadowVertexShader = `
attribute vec3 aPosition;
uniform mat4 uShadowViewProjection;
void main() {
  gl_Position = uShadowViewProjection * vec4(aPosition, 1.0);
}
`;

const shadowFragmentShader = `
precision mediump float;
vec4 encodeDepth(float value) {
  vec4 bitShift = vec4(1.0, 255.0, 65025.0, 16581375.0);
  vec4 bitMask = vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0);
  vec4 rgbaDepth = fract(value * bitShift);
  rgbaDepth -= rgbaDepth.yzww * bitMask;
  return rgbaDepth;
}
void main() {
  gl_FragColor = encodeDepth(gl_FragCoord.z);
}
`;

function createProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error("Could not create WebGL program.");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "WebGL program link failed.");
  }
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  return program;
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create WebGL shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "WebGL shader compile failed.");
  }
  return shader;
}

async function loadOriginalProjectorModel(): Promise<SceneMeshData> {
  const loader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("/draco/");
  loader.setDRACOLoader(dracoLoader);
  try {
    const gltf = await loader.loadAsync("/model.glb");
    const vertices: number[] = [];
    const indices: number[] = [];
    const position = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3();
    const worldPosition = new THREE.Vector3();
    const worldNormal = new THREE.Vector3();
    let receiverId = 1;

    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !(mesh.geometry instanceof THREE.BufferGeometry)) return;
      mesh.updateWorldMatrix(true, false);
      normalMatrix.getNormalMatrix(mesh.matrixWorld);
      const geometry = mesh.geometry;
      const positions = geometry.getAttribute("position");
      const normals = geometry.getAttribute("normal");
      if (!positions || !normals) return;

      const nextReceiverId = mesh.name === "bg" ? 1 : receiverId + 1;
      receiverId = nextReceiverId;
      const vertexStart = vertices.length / 7;
      for (let index = 0; index < positions.count; index += 1) {
        position.fromBufferAttribute(positions, index);
        normal.fromBufferAttribute(normals, index);
        worldPosition.copy(position).applyMatrix4(mesh.matrixWorld);
        worldNormal.copy(normal).applyMatrix3(normalMatrix).normalize();
        vertices.push(
          worldPosition.x,
          worldPosition.y,
          worldPosition.z,
          worldNormal.x,
          worldNormal.y,
          worldNormal.z,
          nextReceiverId,
        );
      }

      const geometryIndex = geometry.index;
      if (geometryIndex) {
        for (let index = 0; index < geometryIndex.count; index += 1) {
          indices.push(vertexStart + geometryIndex.getX(index));
        }
      } else {
        for (let index = 0; index < positions.count; index += 1) {
          indices.push(vertexStart + index);
        }
      }
    });

    if (!vertices.length || !indices.length) {
      throw new Error("model.glb did not contain renderable mesh geometry.");
    }
    return {
      vertices: new Float32Array(vertices),
      indices: vertices.length / 7 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices),
    };
  } finally {
    dracoLoader.dispose();
  }
}

function createSceneMesh(gl: WebGLRenderingContext) {
  const vertices: number[] = [];
  const indices: number[] = [];
  addPlane(vertices, indices, [-5.8, 2.95, -4.35], [5.8, 2.95, -4.35], [5.8, -2.95, -4.35], [-5.8, -2.95, -4.35], 1);
  addPlane(vertices, indices, [-5.8, -2.95, -4.35], [5.8, -2.95, -4.35], [5.8, -2.95, 2.7], [-5.8, -2.95, 2.7], 2);

  addBox(vertices, indices, [-2.6, -1.98, -2.82], [1.9, 0.48, 1.22], 10);
  addBox(vertices, indices, [1.85, -2.04, -2.7], [1.65, 0.36, 1.65], 11);
  addBox(vertices, indices, [0.35, -2.2, -1.75], [1.15, 0.3, 1.25], 12);
  addBox(vertices, indices, [0.65, -1.76, -2.05], [1.0, 0.28, 1.15], 13);
  addBox(vertices, indices, [0.95, -1.34, -2.35], [0.86, 0.26, 1.05], 14);

  addCylinder(vertices, indices, [-0.95, -1.95, -2.85], 0.38, 2.25, 36, 20);
  addCylinder(vertices, indices, [2.45, -1.7, -3.15], 0.42, 2.65, 36, 21);
  addCylinder(vertices, indices, [-3.35, -2.05, -2.95], 0.5, 0.55, 36, 22);
  addCylinder(vertices, indices, [3.05, -2.28, -2.05], 0.64, 0.36, 36, 23);

  addBox(vertices, indices, [-1.55, 0.3, -3.55], [1.45, 0.16, 0.92], 30);
  addBox(vertices, indices, [0.35, 0.95, -3.7], [1.1, 0.16, 0.92], 31);
  addBox(vertices, indices, [2.35, 0.25, -3.5], [1.35, 0.16, 0.86], 32);
  addBox(vertices, indices, [3.15, -0.55, -3.25], [0.82, 0.14, 0.7], 33);

  return uploadSceneMesh(gl, { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) });
}

function uploadSceneMesh(gl: WebGLRenderingContext, sceneMesh: SceneMeshData) {
  const vertexBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();
  if (!vertexBuffer || !indexBuffer) throw new Error("Could not create scene buffers.");
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, sceneMesh.vertices, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, sceneMesh.indices, gl.STATIC_DRAW);
  const indexType = sceneMesh.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
  return { vertexBuffer, indexBuffer, indexCount: sceneMesh.indices.length, indexType };
}

function addPlane(vertices: number[], indices: number[], a: Vec3, b: Vec3, c: Vec3, d: Vec3, receiverId: number) {
  const normal = normalize(cross(subtract(b, a), subtract(c, a)));
  const start = vertices.length / 7;
  for (const point of [a, b, c, d]) vertices.push(...point, ...normal, receiverId);
  indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
}

function addBox(vertices: number[], indices: number[], center: Vec3, size: Vec3, receiverId: number) {
  const [x, y, z] = center;
  const [w, h, d] = size.map((value) => value / 2) as Vec3;
  const p = {
    lbf: [x - w, y - h, z + d] as Vec3,
    rbf: [x + w, y - h, z + d] as Vec3,
    rtf: [x + w, y + h, z + d] as Vec3,
    ltf: [x - w, y + h, z + d] as Vec3,
    lbb: [x - w, y - h, z - d] as Vec3,
    rbb: [x + w, y - h, z - d] as Vec3,
    rtb: [x + w, y + h, z - d] as Vec3,
    ltb: [x - w, y + h, z - d] as Vec3,
  };
  addPlane(vertices, indices, p.lbf, p.rbf, p.rtf, p.ltf, receiverId);
  addPlane(vertices, indices, p.rbf, p.rbb, p.rtb, p.rtf, receiverId);
  addPlane(vertices, indices, p.rbb, p.lbb, p.ltb, p.rtb, receiverId);
  addPlane(vertices, indices, p.lbb, p.lbf, p.ltf, p.ltb, receiverId);
  addPlane(vertices, indices, p.ltf, p.rtf, p.rtb, p.ltb, receiverId);
  addPlane(vertices, indices, p.lbb, p.rbb, p.rbf, p.lbf, receiverId);
}

function addCylinder(
  vertices: number[],
  indices: number[],
  center: Vec3,
  radius: number,
  height: number,
  segments: number,
  receiverId: number,
) {
  const [cx, cy, cz] = center;
  const halfHeight = height / 2;
  const sideStart = vertices.length / 7;
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const x = Math.cos(angle);
    const z = Math.sin(angle);
    vertices.push(cx + x * radius, cy - halfHeight, cz + z * radius, x, 0, z, receiverId);
    vertices.push(cx + x * radius, cy + halfHeight, cz + z * radius, x, 0, z, receiverId);
  }
  for (let index = 0; index < segments; index += 1) {
    const base = sideStart + index * 2;
    indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
  }

  const topCenter = vertices.length / 7;
  vertices.push(cx, cy + halfHeight, cz, 0, 1, 0, receiverId);
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    vertices.push(cx + Math.cos(angle) * radius, cy + halfHeight, cz + Math.sin(angle) * radius, 0, 1, 0, receiverId);
  }
  for (let index = 1; index <= segments; index += 1) {
    indices.push(topCenter, topCenter + index, topCenter + index + 1);
  }

  const bottomCenter = vertices.length / 7;
  vertices.push(cx, cy - halfHeight, cz, 0, -1, 0, receiverId);
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    vertices.push(cx + Math.cos(angle) * radius, cy - halfHeight, cz + Math.sin(angle) * radius, 0, -1, 0, receiverId);
  }
  for (let index = 1; index <= segments; index += 1) {
    indices.push(bottomCenter, bottomCenter + index + 1, bottomCenter + index);
  }
}

type Vec3 = [number, number, number];

function mat4() {
  const out = new Float32Array(16);
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}

function perspective(out: Float32Array, fovy: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovy / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
}

function orthographic(out: Float32Array, left: number, right: number, bottom: number, top: number, near: number, far: number) {
  out.fill(0);
  out[0] = 2 / (right - left);
  out[5] = 2 / (top - bottom);
  out[10] = -2 / (far - near);
  out[12] = -(right + left) / (right - left);
  out[13] = -(top + bottom) / (top - bottom);
  out[14] = -(far + near) / (far - near);
  out[15] = 1;
}

function lookAt(out: Float32Array, eye: Vec3, center: Vec3, up: Vec3) {
  const z = normalize(subtract(eye, center));
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  out[0] = x[0];
  out[1] = y[0];
  out[2] = z[0];
  out[3] = 0;
  out[4] = x[1];
  out[5] = y[1];
  out[6] = z[1];
  out[7] = 0;
  out[8] = x[2];
  out[9] = y[2];
  out[10] = z[2];
  out[11] = 0;
  out[12] = -dot(x, eye);
  out[13] = -dot(y, eye);
  out[14] = -dot(z, eye);
  out[15] = 1;
}

function multiply(out: Float32Array, a: Float32Array, b: Float32Array) {
  const result = new Float32Array(16);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      result[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
    }
  }
  out.set(result);
}

function radians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(a: Vec3, amount: number): Vec3 {
  return [a[0] * amount, a[1] * amount, a[2] * amount];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function length(a: Vec3) {
  return Math.hypot(a[0], a[1], a[2]) || 1;
}

function normalize(a: Vec3): Vec3 {
  const vectorLength = length(a);
  return [a[0] / vectorLength, a[1] / vectorLength, a[2] / vectorLength];
}

function decode16(high: number, low: number) {
  const packed = high * 256 + low;
  return Math.min(1, Math.max(0, (packed - 1) / 65534));
}
