import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, Gauge, Palette, RotateCcw, Sparkles, Waves } from "lucide-react";
import { Badge } from "./components/badge";
import { Button } from "./components/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/card";
import { Slider } from "./components/slider";
import { Switch } from "./components/switch";
import {
  describeTarget,
  findProjectedTarget,
  getDebugId,
  getLocalRect,
  getProjectedControls,
  isClickable,
  type ProjectedSliderSetter,
  updateRangeFromProjectedPoint,
} from "./projection/domHitTest";
import { createProjectionScene } from "./projection/scene";
import { createSpherePanelSurface } from "./projection/sphereSurface";
import type { ProjectionScene } from "./projection/types";
import { ThreeProjectorDemo } from "./routes/ThreeProjectorDemo";
import "./styles.css";

type DemoState = {
  speed: number;
  turbulence: number;
  viscosity: number;
  glow: number;
  mode: "vortex" | "ripple" | "plasma";
  theme: "aurora" | "ember" | "neon";
};

const initialState: DemoState = {
  speed: 48,
  turbulence: 63,
  viscosity: 34,
  glow: 72,
  mode: "vortex",
  theme: "aurora",
};

function supportsHtmlInCanvas(canvas: HTMLCanvasElement | null, gl: WebGL2RenderingContext | null) {
  return Boolean(
      canvas?.requestPaint &&
      canvas?.captureElementImage &&
      gl?.texElementImage2D &&
      "layoutSubtree" in canvas,
  );
}

function drawFallbackTexture(target: HTMLCanvasElement, state: DemoState, seconds: number) {
  const ctx = target.getContext("2d");
  if (!ctx) return;

  const dpr = Math.max(1, window.devicePixelRatio || 1);
  target.width = Math.round(340 * dpr);
  target.height = Math.round(430 * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const accent = state.theme === "ember" ? "#fb7185" : state.theme === "neon" ? "#a78bfa" : "#67e8f9";
  ctx.clearRect(0, 0, 340, 430);
  ctx.fillStyle = "rgba(2, 6, 23, 0.96)";
  roundRect(ctx, 0, 0, 340, 430, 12);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.stroke();

  ctx.fillStyle = "#f8fafc";
  ctx.font = "700 18px Inter, system-ui";
  ctx.fillText("fluid shader console", 22, 38);
  ctx.fillStyle = accent;
  ctx.font = "600 12px Inter, system-ui";
  ctx.fillText(state.theme.toUpperCase(), 246, 38);

  ctx.fillStyle = "rgba(15,23,42,0.95)";
  roundRect(ctx, 20, 64, 300, 116, 8);
  ctx.fill();
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "500 12px Inter, system-ui";
  ctx.fillText(`${state.mode} field`, 36, 92);
  ctx.fillStyle = accent;
  ctx.font = "700 44px Inter, system-ui";
  ctx.fillText(`${state.speed}`, 36, 142);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "500 12px Inter, system-ui";
  ctx.fillText(`t+${seconds.toFixed(1)}s, turbulence ${state.turbulence}, glow ${state.glow}`, 36, 164);

  for (let i = 0; i < 22; i += 1) {
    const x = 24 + i * 13;
    const h = 12 + Math.sin(seconds * state.speed * 0.04 + i * 0.6) * 10 + state.turbulence * 0.16;
    ctx.fillStyle = i % 3 === 0 ? accent : "rgba(148,163,184,0.55)";
    roundRect(ctx, x, 260 - h, 7, h, 3);
    ctx.fill();
  }

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "600 14px Inter, system-ui";
  ctx.fillText(`Viscosity ${state.viscosity} drives the projected flow`, 24, 308);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "500 12px Inter, system-ui";
  ctx.fillText("Fallback texture mirrors React state when native", 24, 334);
  ctx.fillText("texElementImage2D is not available.", 24, 352);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

type DebugRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  active: number;
};

const maxDebugRects = 32;
const projectionScene = createProjectionScene([createSpherePanelSurface()]);

function useProjectedDomRouter(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  panelRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  setActiveDebugTarget: React.Dispatch<React.SetStateAction<string>>,
  sliderSetters: React.RefObject<Map<string, ProjectedSliderSetter>>,
  scene: ProjectionScene,
) {
  const activeRangeRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) return;

    const route = (event: PointerEvent, action: "down" | "move" | "up") => {
      const panel = panelRef.current;
      if (!panel) return;

      const hit = scene.inverseHitTest({ event, canvas, panel });
      if (!hit) {
        window.__projectionRouterStatus = {
          hit: false,
          x: 0,
          y: 0,
          u: 0,
          v: 0,
          target: "",
        };
        canvas.style.cursor = "";
        if (action === "up") activeRangeRef.current = null;
        return;
      }

      if ((action === "move" || action === "up") && activeRangeRef.current) {
        updateRangeFromProjectedPoint(activeRangeRef.current, panel, hit.x, sliderSetters.current);
        if (action === "up") activeRangeRef.current = null;
        event.preventDefault();
        return;
      }

      const target = findProjectedTarget(panel, hit.x, hit.y);
      window.__projectionRouterStatus = {
        hit: true,
        x: Math.round(hit.x),
        y: Math.round(hit.y),
        u: Number(hit.u.toFixed(3)),
        v: Number(hit.v.toFixed(3)),
        target: target ? describeTarget(target) : "",
      };
      canvas.style.cursor = target ? "pointer" : "";
      setActiveDebugTarget(target ? getDebugId(target, panel) : "");
      if (!target) return;

      if (action === "down" && target instanceof HTMLInputElement && target.type === "range") {
        activeRangeRef.current = target;
        updateRangeFromProjectedPoint(target, panel, hit.x, sliderSetters.current);
        canvas.setPointerCapture?.(event.pointerId);
        event.preventDefault();
        return;
      }

      if (action === "down") {
        if (target instanceof HTMLInputElement) {
          target.focus();
          if (target.type === "text") {
            target.setSelectionRange(target.value.length, target.value.length);
          }
        }
        canvas.setPointerCapture?.(event.pointerId);
        event.preventDefault();
        return;
      }

      if (action === "up") {
        if (isClickable(target)) {
          target.click();
          event.preventDefault();
        }
      }
    };

    const onPointerDown = (event: PointerEvent) => route(event, "down");
    const onPointerMove = (event: PointerEvent) => route(event, "move");
    const onPointerUp = (event: PointerEvent) => {
      route(event, "up");
      try {
        canvas.releasePointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture may already be released by the browser.
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
    };
  }, [canvasRef, panelRef, enabled, scene, setActiveDebugTarget, sliderSetters]);
}

function useSphereRenderer(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  panelRef: React.RefObject<HTMLDivElement | null>,
  state: DemoState,
  debugEnabled: boolean,
  activeDebugTarget: string,
  scene: ProjectionScene,
) {
  const [nativeReady, setNativeReady] = useState(false);
  const stateRef = useRef(state);
  const debugEnabledRef = useRef(debugEnabled);
  const activeDebugTargetRef = useRef(activeDebugTarget);

  useEffect(() => {
    stateRef.current = state;
    canvasRef.current?.requestPaint?.();
  }, [canvasRef, state]);

  useEffect(() => {
    debugEnabledRef.current = debugEnabled;
  }, [debugEnabled]);

  useEffect(() => {
    activeDebugTargetRef.current = activeDebugTarget;
  }, [activeDebugTarget]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", { alpha: false, antialias: true });
    if (!gl) return;

    canvas.setAttribute("layoutsubtree", "");
    canvas.layoutSubtree = true;

    const program = createSphereProgram(gl, scene);
    const buffer = gl.createBuffer();
    const texture = gl.createTexture();
    const fallbackCanvas = document.createElement("canvas");
    let elementImage: ElementImage | null = null;
    let startedAt = performance.now();
    let frame = 0;
    let running = true;

    if (!program || !buffer || !texture) return;

    const native = supportsHtmlInCanvas(canvas, gl);
    setNativeReady(false);
    window.__htmlInCanvasStatus = {
      nativeApisAvailable: native,
      nativeUploadSucceeded: false,
      elementCaptured: false,
      lastNativeError: "",
    };

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.useProgram(program);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const resize = () => {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      canvas.requestPaint?.();
    };

    const uploadTexture = () => {
      const panel = panelRef.current;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

      if (native && gl.texElementImage2D) {
        try {
          if (elementImage) {
            gl.texElementImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, elementImage);
          } else if (panel) {
            gl.texElementImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, panel);
          } else {
            throw new Error("React panel element is not mounted yet.");
          }
          setNativeReady(true);
          window.__htmlInCanvasStatus = {
            nativeApisAvailable: true,
            nativeUploadSucceeded: true,
            elementCaptured: Boolean(elementImage),
            lastNativeError: "",
          };
          return;
        } catch (error) {
          setNativeReady(false);
          window.__htmlInCanvasStatus = {
            nativeApisAvailable: true,
            nativeUploadSucceeded: false,
            elementCaptured: Boolean(elementImage),
            lastNativeError: error instanceof Error ? error.message : String(error),
          };
        }
      }

      drawFallbackTexture(fallbackCanvas, stateRef.current, (performance.now() - startedAt) / 1000);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fallbackCanvas);
    };

    const render = () => {
      if (!running) return;
      const seconds = (performance.now() - startedAt) / 1000;
      uploadTexture();

      gl.useProgram(program);
      gl.uniform2f(gl.getUniformLocation(program, "uResolution"), canvas.width, canvas.height);
      gl.uniform1f(gl.getUniformLocation(program, "uTime"), seconds);
      gl.uniform1f(gl.getUniformLocation(program, "uSpeed"), stateRef.current.speed / 50);
      gl.uniform1f(gl.getUniformLocation(program, "uTurbulence"), stateRef.current.turbulence / 100);
      gl.uniform1f(gl.getUniformLocation(program, "uViscosity"), stateRef.current.viscosity / 100);
      gl.uniform1f(gl.getUniformLocation(program, "uGlow"), stateRef.current.glow / 100);
      gl.uniform1i(gl.getUniformLocation(program, "uMode"), ["vortex", "ripple", "plasma"].indexOf(stateRef.current.mode));
      gl.uniform1i(gl.getUniformLocation(program, "uTheme"), ["aurora", "ember", "neon"].indexOf(stateRef.current.theme));
      uploadDebugRects(gl, program, panelRef.current, debugEnabledRef.current, activeDebugTargetRef.current);
      gl.uniform1i(gl.getUniformLocation(program, "uPanel"), 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      frame = requestAnimationFrame(render);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    canvas.onpaint = () => {
      const panel = panelRef.current;
      if (native && panel && canvas.captureElementImage) {
        try {
          elementImage?.close();
          elementImage = canvas.captureElementImage(panel);
          window.__htmlInCanvasStatus = {
            nativeApisAvailable: true,
            nativeUploadSucceeded: false,
            elementCaptured: true,
            lastNativeError: "",
          };
        } catch (error) {
          setNativeReady(false);
          window.__htmlInCanvasStatus = {
            nativeApisAvailable: true,
            nativeUploadSucceeded: false,
            elementCaptured: false,
            lastNativeError: error instanceof Error ? error.message : String(error),
          };
        }
      }
      uploadTexture();
    };
    resize();
    render();

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.onpaint = null;
      elementImage?.close();
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      startedAt = 0;
    };
  }, [canvasRef, panelRef, scene]);

  return nativeReady;
}

function uploadDebugRects(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  panel: HTMLElement | null,
  enabled: boolean,
  activeDebugTarget: string,
) {
  const rectData = new Float32Array(maxDebugRects * 4);
  let count = 0;

  if (enabled && panel) {
    const controls = getProjectedControls(panel);
    const panelWidth = panel.offsetWidth || 1;
    const panelHeight = panel.offsetHeight || 1;

    controls.slice(0, maxDebugRects).forEach((control, index) => {
      const rect = getLocalRect(control, panel);
      const offset = index * 4;
      rectData[offset] = rect.left / panelWidth;
      rectData[offset + 1] = 1 - (rect.top + rect.height) / panelHeight;
      rectData[offset + 2] = (rect.left + rect.width) / panelWidth;
      rectData[offset + 3] = 1 - rect.top / panelHeight;
      count += 1;
    });
  }

  gl.uniform1i(gl.getUniformLocation(program, "uDebugEnabled"), enabled ? 1 : 0);
  gl.uniform1i(gl.getUniformLocation(program, "uDebugRectCount"), count);
  gl.uniform1i(gl.getUniformLocation(program, "uActiveDebugRect"), Number(activeDebugTarget || -1));
  gl.uniform4fv(gl.getUniformLocation(program, "uDebugRects"), rectData);
}

function createSphereProgram(gl: WebGL2RenderingContext, scene: ProjectionScene) {
  const surface = scene.surfaces[0];
  if (!surface.glslPanelUv || !surface.glslOnSurface) {
    throw new Error(`Surface ${surface.id} does not provide fragment-shader projection snippets.`);
  }
  const vertex = `#version 300 es
    layout(location=0) in vec2 position;
    out vec2 vUv;
    void main() {
      vUv = position * 0.5 + 0.5;
      gl_Position = vec4(position, 0.0, 1.0);
    }`;

  const fragment = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 outColor;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uSpeed;
    uniform float uTurbulence;
    uniform float uViscosity;
    uniform float uGlow;
    uniform int uMode;
    uniform int uTheme;
    uniform sampler2D uPanel;
    uniform int uDebugEnabled;
    uniform int uDebugRectCount;
    uniform int uActiveDebugRect;
    uniform vec4 uDebugRects[${maxDebugRects}];

    float rectOutline(vec2 uv, vec4 rect, float thickness) {
      float insideX = step(rect.x, uv.x) * step(uv.x, rect.z);
      float insideY = step(rect.y, uv.y) * step(uv.y, rect.w);
      float inside = insideX * insideY;
      vec2 edge = min(uv - rect.xy, rect.zw - uv);
      float line = 1.0 - smoothstep(0.0, thickness, min(edge.x, edge.y));
      return inside * line;
    }

    mat2 rot(float a) {
      float s = sin(a);
      float c = cos(a);
      return mat2(c, -s, s, c);
    }

    float field(vec2 p, float t) {
      float viscosity = mix(1.35, 0.28, uViscosity);
      p *= mix(2.0, 5.4, uTurbulence);
      float v = 0.0;
      for (int i = 0; i < 5; i++) {
        float f = float(i + 1);
        p = rot(0.42 + sin(t * 0.21 + f) * 0.18) * p;
        vec2 q = p + vec2(sin(p.y * viscosity + t * (0.28 + f * 0.04)), cos(p.x * viscosity - t * 0.31));
        if (uMode == 0) {
          v += sin(length(q) * (2.1 + f) - t * (1.1 + f * 0.16)) / f;
        } else if (uMode == 1) {
          v += sin(q.x * (2.0 + f) + cos(q.y * 2.4 + t) * 1.5) / f;
        } else {
          v += sin(q.x * f + t) * cos(q.y * (f + 1.4) - t * 0.72) / f;
        }
        p += q.yx * 0.18;
      }
      return v;
    }

    vec3 themeColor(float value, float energy) {
      vec3 a;
      vec3 b;
      vec3 c;
      if (uTheme == 1) {
        a = vec3(0.12, 0.025, 0.018);
        b = vec3(1.0, 0.22, 0.08);
        c = vec3(1.0, 0.76, 0.22);
      } else if (uTheme == 2) {
        a = vec3(0.035, 0.025, 0.12);
        b = vec3(0.64, 0.32, 1.0);
        c = vec3(0.15, 1.0, 0.78);
      } else {
        a = vec3(0.015, 0.07, 0.08);
        b = vec3(0.12, 0.95, 0.92);
        c = vec3(0.68, 1.0, 0.36);
      }
      return mix(a, b, smoothstep(-0.6, 0.85, value)) + c * energy;
    }

    void main() {
      vec2 p = (gl_FragCoord.xy * 2.0 - uResolution) / min(uResolution.x, uResolution.y);
      p.x -= 0.18;
      vec3 ro = vec3(0.0, 0.0, 3.1);
      vec3 rd = normalize(vec3(p, -2.05));
      float b = dot(ro, rd);
      float c = dot(ro, ro) - 1.0;
      float h = b * b - c;
      if (h < 0.0) {
        vec3 sky = mix(vec3(0.015, 0.026, 0.055), vec3(0.05, 0.08, 0.11), vUv.y);
        outColor = vec4(sky, 1.0);
        return;
      }

      float t = -b - sqrt(h);
      vec3 pos = ro + rd * t;
      vec3 n = normalize(pos);
      vec3 light = normalize(vec3(-0.9, 0.35, 0.75));
      float diffuse = max(dot(n, light), 0.0);
      float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.4);

      float u = atan(n.z, n.x) / 6.2831853 + 0.5;
      float v = asin(n.y) / 3.1415926 + 0.5;
      vec2 flowUv = vec2(u, v);
      vec2 flow = flowUv - 0.5;
      flow.x *= 1.9;
      float tFlow = uTime * mix(0.08, 1.15, clamp(uSpeed, 0.0, 2.0));
      float f = field(flow + n.xy * 0.45, tFlow);
      float eddy = abs(field(flow * 1.7 + vec2(0.2, -0.12), tFlow * 1.33));
      float filaments = smoothstep(0.42, 0.92, abs(sin(f * 4.0 + eddy * 2.6)));
      vec3 base = themeColor(f, filaments * uGlow * 0.45);
      base *= 0.34 + diffuse * 0.9;
      base += rim * mix(vec3(0.1, 0.25, 0.28), vec3(0.75, 1.0, 0.95), uGlow) * 0.72;
      base += vec3(0.04, 0.09, 0.12) * sin((u + v + tFlow * 0.1) * 90.0) * uTurbulence;

      vec2 panelUv = ${surface.glslPanelUv};
      bool onPanel = ${surface.glslOnSurface};
      if (onPanel) {
        vec4 panel = texture(uPanel, panelUv);
        vec2 edge = min(panelUv, 1.0 - panelUv);
        float border = 1.0 - smoothstep(0.0, 0.025, min(edge.x, edge.y));
        base = mix(base, panel.rgb, max(panel.a, 0.92));
        base += border * vec3(0.35, 0.95, 1.0) * 0.28;
        base += vec3(0.04, 0.1, 0.12) * sin(panelUv.y * 60.0 + uTime * 4.0) * 0.08;

        if (uDebugEnabled == 1) {
          for (int i = 0; i < ${maxDebugRects}; i++) {
            if (i >= uDebugRectCount) {
              break;
            }
            float outline = rectOutline(panelUv, uDebugRects[i], 0.012);
            vec3 debugColor = i == uActiveDebugRect ? vec3(1.0, 0.24, 0.42) : vec3(0.98, 0.86, 0.2);
            base = mix(base, debugColor, outline * 0.92);
          }
        }
      }

      float lat = smoothstep(0.99, 1.0, sin((u + tFlow * 0.015) * 96.0));
      float lon = smoothstep(0.985, 1.0, sin((v - tFlow * 0.012) * 82.0));
      base += (lat + lon) * 0.025 * (0.4 + uTurbulence);
      outColor = vec4(pow(base, vec3(0.92)), 1.0);
    }`;

  const vs = compileShader(gl, gl.VERTEX_SHADER, vertex);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragment);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

type PanelProps = {
  state: DemoState;
  setState: React.Dispatch<React.SetStateAction<DemoState>>;
  nativeReady: boolean;
  sliderSetters: React.RefObject<Map<string, ProjectedSliderSetter>>;
};

function ControlPanel({
  state,
  setState,
  nativeReady,
  sliderSetters,
}: PanelProps) {
  const panelInstanceId = React.useId();
  const speedSliderId = `${panelInstanceId}-speed`;
  const turbulenceSliderId = `${panelInstanceId}-turbulence`;
  const viscositySliderId = `${panelInstanceId}-viscosity`;
  const glowSliderId = `${panelInstanceId}-glow`;

  const energy = useMemo(() => {
    return Math.round(state.speed * 0.35 + state.turbulence * 0.3 + state.glow * 0.25 + (100 - state.viscosity) * 0.1);
  }, [state.glow, state.speed, state.turbulence, state.viscosity]);

  useEffect(() => {
    sliderSetters.current.set(speedSliderId, (speed) => setState((current) => ({ ...current, speed })));
    sliderSetters.current.set(turbulenceSliderId, (turbulence) => setState((current) => ({ ...current, turbulence })));
    sliderSetters.current.set(viscositySliderId, (viscosity) => setState((current) => ({ ...current, viscosity })));
    sliderSetters.current.set(glowSliderId, (glow) => setState((current) => ({ ...current, glow })));
    return () => {
      sliderSetters.current.delete(speedSliderId);
      sliderSetters.current.delete(turbulenceSliderId);
      sliderSetters.current.delete(viscositySliderId);
      sliderSetters.current.delete(glowSliderId);
    };
  }, [glowSliderId, setState, sliderSetters, speedSliderId, turbulenceSliderId, viscositySliderId]);

  return (
    <Card className="w-[285px] overflow-hidden">
      <CardHeader className="p-3 pb-1.5">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Waves className="h-4 w-4 text-cyan-200" />
            fluid shader console
          </CardTitle>
          <Badge>{nativeReady ? "native" : "fallback"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-3 pt-1.5">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md bg-slate-900 p-2">
            <div className="text-xs text-slate-400">mode</div>
            <div className="truncate font-mono text-lg text-cyan-100">{state.mode}</div>
          </div>
          <div className="rounded-md bg-slate-900 p-2">
            <div className="text-xs text-slate-400">energy</div>
            <div className="font-mono text-lg text-lime-100">{energy}</div>
          </div>
          <div className="rounded-md bg-slate-900 p-2">
            <div className="text-xs text-slate-400">theme</div>
            <div className="truncate font-mono text-lg text-rose-100">{state.theme}</div>
          </div>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <Activity className="h-4 w-4 text-cyan-200" />
            flow mode
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(["vortex", "ripple", "plasma"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setState((current) => ({ ...current, mode }))}
                className={`h-8 rounded-md border text-xs font-medium ${
                  state.mode === mode ? "border-cyan-200 bg-cyan-300/25 text-cyan-50" : "border-white/10 bg-slate-900"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <Palette className="h-4 w-4 text-lime-200" />
            color profile
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(["aurora", "ember", "neon"] as const).map((theme) => (
              <button
                key={theme}
                type="button"
                onClick={() => setState((current) => ({ ...current, theme }))}
                className={`h-8 rounded-md border text-xs font-medium ${
                  state.theme === theme ? "border-white/70 bg-white/15" : "border-white/10 bg-slate-900"
                }`}
              >
                {theme}
              </button>
            ))}
          </div>
        </div>

        <Slider
          label="advection speed"
          min={0}
          max={100}
          value={state.speed}
          onValueChange={(speed) => setState((current) => ({ ...current, speed }))}
          projectedSliderId={speedSliderId}
        />
        <Slider
          label="turbulence"
          min={0}
          max={100}
          value={state.turbulence}
          onValueChange={(turbulence) => setState((current) => ({ ...current, turbulence }))}
          projectedSliderId={turbulenceSliderId}
        />
        <Slider
          label="viscosity"
          min={0}
          max={100}
          value={state.viscosity}
          onValueChange={(viscosity) => setState((current) => ({ ...current, viscosity }))}
          projectedSliderId={viscositySliderId}
        />
        <Slider
          label="rim glow"
          min={0}
          max={100}
          value={state.glow}
          onValueChange={(glow) => setState((current) => ({ ...current, glow }))}
          projectedSliderId={glowSliderId}
        />

        <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md bg-slate-900 px-3 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Gauge className="h-4 w-4 text-cyan-200" />
              field pressure
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-700">
              <div
                className="h-full rounded-full bg-cyan-300 transition-[width]"
                style={{ width: `${energy}%` }}
              />
            </div>
          </div>
          <Button variant="secondary" size="icon" aria-label="reset shader controls" onClick={() => setState(initialState)}>
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nativePanelRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<DemoState>(initialState);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [activeDebugTarget, setActiveDebugTarget] = useState("");
  const sliderSetters = useRef(new Map<string, ProjectedSliderSetter>());
  const nativeReady = useSphereRenderer(
    canvasRef,
    nativePanelRef,
    state,
    debugEnabled,
    activeDebugTarget,
    projectionScene,
  );
  useProjectedDomRouter(
    canvasRef,
    nativePanelRef,
    nativeReady,
    setActiveDebugTarget,
    sliderSetters,
    projectionScene,
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="relative min-h-screen overflow-hidden">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label="Side-lit sphere canvas">
          <div ref={nativePanelRef} className="canvas-react-panel">
            <ControlPanel
              state={state}
              setState={setState}
              nativeReady={nativeReady}
              sliderSetters={sliderSetters}
            />
          </div>
        </canvas>

        {!nativeReady && (
          <div className="fallback-react-panel">
            <ControlPanel
              state={state}
              setState={setState}
              nativeReady={nativeReady}
              sliderSetters={sliderSetters}
            />
          </div>
        )}

        <div className="pointer-events-none absolute left-6 top-6 max-w-[520px] text-sm text-slate-300">
          <h1 className="mb-2 text-2xl font-semibold text-white">React inside experimental HTML-in-canvas</h1>
          <p>
            Native path: React renders as a direct canvas child, Chromium captures it with the WICG
            HTML-in-canvas texture API, and WebGL maps it onto the sphere. Fallback path mirrors the same
            state while ordinary browsers wait for the flag/API.
          </p>
          <div className="pointer-events-auto mt-4 inline-flex items-center gap-3 rounded-md border border-white/10 bg-slate-950/85 px-3 py-2 text-slate-100 shadow-xl">
            <span className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-yellow-200" />
              projected hitboxes
            </span>
            <Switch
              checked={debugEnabled}
              onCheckedChange={setDebugEnabled}
              aria-label="Toggle projected hitbox overlay"
            />
          </div>
          <div className="pointer-events-auto mt-3">
            <Button
              variant="secondary"
              onClick={() => {
                window.history.pushState({}, "", "/three-projector");
                window.dispatchEvent(new PopStateEvent("popstate"));
              }}
            >
              <Palette className="h-4 w-4" />
              Three projector route
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}

function Root() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (path === "/three-projector") {
    return <ThreeProjectorDemo />;
  }

  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
