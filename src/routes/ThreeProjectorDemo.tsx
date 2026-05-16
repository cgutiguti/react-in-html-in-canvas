import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ArrowLeft, Palette, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "../components/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/card";
import { Slider } from "../components/slider";
import { HtmlToCanvasTexture } from "../projection/htmlToCanvasTexture";
import {
  describeTarget,
  getLocalRect,
  getProjectedControls,
} from "../projection/domHitTest";
import { createProjectedDomViewport, type ProjectedDomViewport } from "../projection/projectedDomViewport";
import { createThreeHtmlProjector } from "../projection/threeProjectedMaterial";
import { createThreeProjectorPickBuffer, type ThreeProjectorPickBuffer } from "../projection/threeProjectorPickBuffer";

type ThreeControlState = {
  material: "pearl" | "carbon" | "glass";
  projection: "cyan" | "magenta" | "gold";
  opacity: number;
  litness: number;
};

const initialThreeState: ThreeControlState = {
  material: "pearl",
  projection: "cyan",
  opacity: 100,
  litness: 54,
};

const cameraFov = 45;
const restPosition = new THREE.Vector3(0, 0, 15);
const lookTarget = new THREE.Vector3(0, -1, -4);
const projectedTextureSize = { width: 260, height: 190 };

const textureCss = `
* { box-sizing: border-box; }
body { margin: 0; }
button, input { font: inherit; margin: 0; }
button { appearance: none; -webkit-appearance: none; padding: 0; }
.projected-three-card {
  position: relative;
  width: 260px;
  height: 190px;
  padding: 13px;
  color: #020617;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  border-radius: 0;
  background: transparent;
  border: 0;
}
.projected-three-card h2 { margin: 0 0 7px; font-size: 18px; line-height: 1; }
.projected-three-card p { margin: 0 0 10px; color: rgba(15, 23, 42, 0.86); font-size: 10px; font-weight: 700; }
.projected-three-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.projected-three-cell { border-radius: 7px; background: rgba(255, 255, 255, 0.78); border: 1px solid rgba(2, 6, 23, 0.22); padding: 7px; }
.projected-three-label { color: rgba(51, 65, 85, 0.95); font-size: 7px; text-transform: uppercase; letter-spacing: .08em; }
.projected-three-value { margin-top: 4px; font-size: 13px; font-weight: 800; }
.projected-three-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 10px; }
.projected-three-actions button {
  display: block;
  width: 100%;
  height: 24px;
  border-radius: 7px;
  border: 1px solid rgba(2, 6, 23, .45);
  background: rgba(255, 255, 255, .82);
  color: #020617;
  font-size: 10px;
  font-weight: 800;
}
.projected-three-slider { display: grid; gap: 3px; margin-top: 9px; font-size: 8px; font-weight: 800; color: rgba(15, 23, 42, .82); }
.projected-three-slider span { display: flex; justify-content: space-between; }
.projected-three-slider input { width: 100%; accent-color: #06b6d4; }
.show-projected-hitboxes .projected-three-actions button {
  border: 2px solid rgba(250, 204, 21, 1);
  background: rgba(250, 204, 21, .34);
  box-shadow: 0 0 10px rgba(250, 204, 21, .95);
}
.show-projected-hitboxes .projected-three-slider input {
  outline: 2px solid rgba(250, 204, 21, 1);
  box-shadow: 0 0 10px rgba(250, 204, 21, .95);
}
.projected-dom-interaction-root {
  position: fixed;
  left: 0;
  top: 0;
  width: 260px;
  height: 190px;
  z-index: 2147483647;
  opacity: 0.001;
  pointer-events: none;
  overflow: hidden;
}
`;

export function ThreeProjectorDemo() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const textureSourceRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<{
    htmlTexture?: HtmlToCanvasTexture;
    domViewport?: ProjectedDomViewport;
    projector?: ReturnType<typeof createThreeHtmlProjector>;
    meshMaterials: THREE.Material[];
    projectedMeshes: THREE.Mesh[];
    projectorCamera?: THREE.PerspectiveCamera;
    renderCamera?: THREE.PerspectiveCamera;
    renderer?: THREE.WebGLRenderer;
    pickBuffer?: ThreeProjectorPickBuffer;
    lastProjectedPoint?: { x: number; y: number } | null;
  }>({ meshMaterials: [], projectedMeshes: [] });
  const [state, setState] = useState<ThreeControlState>(initialThreeState);
  const [loadStatus, setLoadStatus] = useState("loading GLB");
  const [hitboxesVisible, setHitboxesVisible] = useState(false);
  const [routerStatus, setRouterStatus] = useState("no projected hit yet");

  useEffect(() => {
    const mount = mountRef.current;
    const textureSource = textureSourceRef.current;
    if (!mount || !textureSource) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    mount.appendChild(renderer.domElement);
    controlsRef.current.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    const camera = new THREE.PerspectiveCamera(cameraFov, mount.clientWidth / mount.clientHeight, 1, 100);
    camera.position.copy(restPosition);
    camera.lookAt(lookTarget);
    controlsRef.current.renderCamera = camera;

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.copy(lookTarget);
    orbit.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.88));
    const key = new THREE.DirectionalLight(0xffffff, 2.8);
    key.position.copy(restPosition);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 50;
    key.shadow.camera.left = -15;
    key.shadow.camera.right = 15;
    key.shadow.camera.top = 15;
    key.shadow.camera.bottom = -15;
    key.shadow.bias = -0.0001;
    key.shadow.normalBias = 0.02;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.42);
    fill.position.set(-6, 5, -4);
    scene.add(fill);

    const htmlTexture = new HtmlToCanvasTexture(textureSource, { ...projectedTextureSize, pixelRatio: 2 });
    controlsRef.current.htmlTexture = htmlTexture;
    controlsRef.current.domViewport = createProjectedDomViewport(textureSource);

    const projectorCamera = new THREE.PerspectiveCamera(cameraFov, mount.clientWidth / mount.clientHeight, 1, 100);
    projectorCamera.position.copy(restPosition);
    projectorCamera.lookAt(lookTarget);
    projectorCamera.updateMatrixWorld();
    controlsRef.current.projectorCamera = projectorCamera;

    const projector = createThreeHtmlProjector({
      camera: projectorCamera,
      texture: htmlTexture.texture,
      opacity: state.opacity / 100,
    });
    controlsRef.current.projector = projector;

    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("/draco/");
    loader.setDRACOLoader(dracoLoader);
    loader.load("/model.glb", (gltf) => {
      const model = gltf.scene;
      let meshCount = 0;
      const standardMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.46,
        metalness: 0,
      });
      const backgroundMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.8,
        metalness: 0,
      });
      model.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        meshCount += 1;

        if (mesh.name === "bg") {
          mesh.material = backgroundMaterial;
          mesh.castShadow = false;
          mesh.receiveShadow = true;
          controlsRef.current.projectedMeshes.push(mesh);
          projector.applyTo(mesh);
          return;
        }

        mesh.material = standardMaterial;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (!controlsRef.current.meshMaterials.includes(standardMaterial)) {
          controlsRef.current.meshMaterials.push(standardMaterial);
        }
        controlsRef.current.projectedMeshes.push(mesh);
        projector.applyTo(mesh);
      });
      scene.add(model);
      controlsRef.current.pickBuffer = createThreeProjectorPickBuffer({
        renderer,
        scene,
        renderCamera: camera,
        projectorCamera,
      });
      applyThreeState(state);
      updateProjectedHitboxUniforms(hitboxesVisible);
      void updateProjectedTextures();
      setLoadStatus(`loaded ${meshCount} meshes`);
    }, undefined, (error) => {
      console.error(error);
      setLoadStatus(error instanceof Error ? error.message : "GLB load failed");
    });

    let frame = 0;
    const animate = () => {
      orbit.update();
      projector.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      projectorCamera.aspect = width / height;
      projectorCamera.updateProjectionMatrix();
      controlsRef.current.pickBuffer?.resize(width, height);
    };
    window.addEventListener("resize", onResize);

    const routeProjectedPointer = (event: PointerEvent) => {
      const panel = textureSourceRef.current;
      const pickBuffer = controlsRef.current.pickBuffer;
      const rendererElement = controlsRef.current.renderer?.domElement;
      if (!panel || !pickBuffer || !rendererElement) return;

      const picked = pickBuffer.pick(event.clientX, event.clientY);
      if (!picked) {
        if (event.type !== "pointermove") {
          console.debug("[projected-pick-miss]", {
            type: event.type,
            pick: pickBuffer.getLastDebug(),
          });
        }
        rendererElement.style.cursor = "";
        if (event.type === "pointerup") {
          controlsRef.current.domViewport?.releasePointer(event.pointerId);
          controlsRef.current.lastProjectedPoint = null;
          try {
            rendererElement.releasePointerCapture?.(event.pointerId);
          } catch {
            // Pointer capture may already be released.
          }
        }
        if (event.type !== "pointermove") {
          setRouterStatus("missed projected pixels");
        }
        return;
      }
      const hit = {
        x: picked.u * projectedTextureSize.width,
        y: (1 - picked.v) * projectedTextureSize.height,
        u: picked.u,
        v: picked.v,
      };
      controlsRef.current.lastProjectedPoint = { x: hit.x, y: hit.y };

      const viewportResult = controlsRef.current.domViewport?.routePointer(event, hit) ?? { target: null, captured: null };
      const target = viewportResult.target;
      const captured = viewportResult.captured;
      const domDebug = controlsRef.current.domViewport?.getLastDebug();
      if (event.type !== "pointermove" || target || captured) {
        console.debug("[projected-dom-route]", {
          type: event.type,
          hit,
          target: target ? describeTarget(target) : "",
          captured: captured ? describeTarget(captured) : "",
          domDebug,
        });
      }

      rendererElement.style.cursor = target || captured ? "pointer" : "";
      const nextRouterStatus = `${event.type}: x ${Math.round(hit.x)}, y ${Math.round(hit.y)}${
        target
          ? ` -> browser ${describeTarget(target)}`
          : captured
            ? ` -> captured ${describeTarget(captured)}`
            : " -> projected pixel, no DOM target"
      }`;
      if (event.type !== "pointermove" || target || captured) {
        setRouterStatus(nextRouterStatus);
        requestAnimationFrame(() => void updateProjectedTextures());
      }
      window.__projectionRouterStatus = {
        hit: true,
        x: Math.round(hit.x),
        y: Math.round(hit.y),
        u: Number(hit.u.toFixed(3)),
        v: Number(hit.v.toFixed(3)),
        target: target ? describeTarget(target) : captured ? describeTarget(captured) : "",
      };

      if ((event.type === "pointerdown" || event.type === "pointermove" || event.type === "pointerup") && (target || captured)) {
        void updateProjectedTextures();
        event.preventDefault();
        if (event.type === "pointerdown") {
          rendererElement.setPointerCapture?.(event.pointerId);
        }
      }

      if (event.type === "pointerup") {
        try {
          rendererElement.releasePointerCapture?.(event.pointerId);
        } catch {
          // Pointer capture may already be released.
        }
      }
    };

    renderer.domElement.addEventListener("pointermove", routeProjectedPointer);
    renderer.domElement.addEventListener("pointerdown", routeProjectedPointer);
    renderer.domElement.addEventListener("pointerup", routeProjectedPointer);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointermove", routeProjectedPointer);
      renderer.domElement.removeEventListener("pointerdown", routeProjectedPointer);
      renderer.domElement.removeEventListener("pointerup", routeProjectedPointer);
      orbit.dispose();
      dracoLoader.dispose();
      htmlTexture.dispose();
      controlsRef.current.pickBuffer?.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    applyThreeState(state);
    void updateProjectedTextures();
  }, [state]);

  useEffect(() => {
    updateProjectedHitboxUniforms(hitboxesVisible);
    void updateProjectedTextures();
    const frame = requestAnimationFrame(() => void updateProjectedTextures());
    return () => cancelAnimationFrame(frame);
  }, [hitboxesVisible]);

  async function updateProjectedTextures() {
    await controlsRef.current.htmlTexture?.update(textureCss);
  }

  function applyThreeState(next: ThreeControlState) {
    for (const material of controlsRef.current.meshMaterials) {
      if ("color" in material && material.color instanceof THREE.Color) {
        material.color.setHex(0xffffff);
      }
      if (material instanceof THREE.MeshStandardMaterial) {
        material.roughness = next.material === "glass" ? 0.18 : next.material === "carbon" ? 0.62 : 0.46;
        material.metalness = next.material === "glass" ? 0.02 : 0;
      }
      material.needsUpdate = true;
    }

    if (controlsRef.current.projector) {
      controlsRef.current.projector.uniforms.projectionOpacity.value = next.opacity / 100;
    }
  }

  function updateProjectedHitboxUniforms(visible: boolean) {
    const projector = controlsRef.current.projector;
    const panel = textureSourceRef.current;
    if (!projector || !panel) return;

    const panelWidth = panel.offsetWidth || projectedTextureSize.width;
    const panelHeight = panel.offsetHeight || projectedTextureSize.height;
    const rects = getProjectedControls(panel).map((control) => getLocalRect(control, panel));
    projector.uniforms.hitboxRects.value.fill(0);
    rects.slice(0, 16).forEach((rect, index) => {
      const offset = index * 4;
      projector.uniforms.hitboxRects.value[offset] = rect.left / panelWidth;
      projector.uniforms.hitboxRects.value[offset + 1] = 1 - (rect.top + rect.height) / panelHeight;
      projector.uniforms.hitboxRects.value[offset + 2] = (rect.left + rect.width) / panelWidth;
      projector.uniforms.hitboxRects.value[offset + 3] = 1 - rect.top / panelHeight;
    });
    projector.uniforms.hitboxCount.value = rects.length;
    projector.uniforms.hitboxOpacity.value = visible ? 0.82 : 0;
  }

  const accentColor = state.projection === "magenta" ? "#86198f" : state.projection === "gold" ? "#92400e" : "#155e75";
  const accentShadow = `0 0 ${Math.round(2 + state.litness * 0.08)}px rgba(255,255,255,.95)`;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <style>{textureCss}</style>
      <div ref={mountRef} className="fixed inset-0" />

      <div className="pointer-events-none fixed left-6 top-6 z-10 max-w-[480px] text-sm text-slate-700">
        <div className="pointer-events-auto mb-4">
          <Button
            variant="secondary"
            onClick={() => {
              window.history.pushState({}, "", "/");
              window.dispatchEvent(new PopStateEvent("popstate"));
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            sphere demo
          </Button>
        </div>
        <h1 className="mb-2 text-2xl font-semibold text-slate-950">Three.js projector route</h1>
        <p>
          React renders the projected label texture, while the controls below change the GLTF object material and
          projection style.
        </p>
        <p className="mt-2">
          The initial camera is aligned with the projector; orbit the view to reveal the projection on the geometry.
        </p>
        <div className="mt-2 rounded-md bg-slate-950/80 px-3 py-2 font-mono text-xs text-cyan-100">
          {loadStatus}
        </div>
        <div className="mt-2 rounded-md bg-slate-950/80 px-3 py-2 font-mono text-xs text-yellow-100">
          {routerStatus}
        </div>
        <div className="pointer-events-auto mt-3">
          <Button variant="secondary" onClick={() => setHitboxesVisible((value) => !value)}>
            <Sparkles className="h-4 w-4" />
            {hitboxesVisible ? "hide" : "show"} projected hitboxes
          </Button>
        </div>
      </div>

      <Card className="fixed bottom-6 right-6 z-10 w-[360px] border-slate-700 bg-slate-950/92">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-200" />
            object projection controls
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-3 gap-2">
            {(["pearl", "carbon", "glass"] as const).map((material) => (
              <button
                key={material}
                type="button"
                onClick={() => setState((current) => ({ ...current, material }))}
                className={`h-9 rounded-md border text-xs font-medium ${
                  state.material === material ? "border-cyan-200 bg-cyan-300/25" : "border-white/10 bg-slate-900"
                }`}
              >
                {material}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(["cyan", "magenta", "gold"] as const).map((projection) => (
              <button
                key={projection}
                type="button"
                onClick={() => setState((current) => ({ ...current, projection }))}
                className={`h-9 rounded-md border text-xs font-medium ${
                  state.projection === projection ? "border-white/70 bg-white/15" : "border-white/10 bg-slate-900"
                }`}
              >
                {projection}
              </button>
            ))}
          </div>

          <Slider
            label="projection opacity"
            min={0}
            max={100}
            value={state.opacity}
            onValueChange={(opacity) => setState((current) => ({ ...current, opacity }))}
          />
          <Slider
            label="label intensity"
            min={0}
            max={100}
            value={state.litness}
            onValueChange={(litness) => setState((current) => ({ ...current, litness }))}
          />
          <Button variant="secondary" onClick={() => setState(initialThreeState)}>
            <RotateCcw className="h-4 w-4" />
            reset object
          </Button>
        </CardContent>
      </Card>

      <div className="projected-dom-interaction-root">
        <div
          ref={textureSourceRef}
          className={`projected-three-card ${hitboxesVisible ? "show-projected-hitboxes" : ""}`}
        >
          <h2 style={{ color: accentColor, textShadow: accentShadow }}>react projector</h2>
          <p>Projected from a live React component onto the GLTF scene.</p>
          <div className="projected-three-grid">
            <div className="projected-three-cell">
              <div className="projected-three-label">material</div>
              <div className="projected-three-value">{state.material}</div>
            </div>
            <div className="projected-three-cell">
              <div className="projected-three-label">opacity</div>
              <div className="projected-three-value">{state.opacity}</div>
            </div>
            <div className="projected-three-cell">
              <div className="projected-three-label">theme</div>
              <div className="projected-three-value">{state.projection}</div>
            </div>
          </div>
          <div className="projected-three-actions">
            {(["pearl", "carbon", "glass"] as const).map((material) => (
              <button
                key={material}
                type="button"
                onClick={() => setState((current) => ({ ...current, material }))}
              >
                {material}
              </button>
            ))}
            {(["cyan", "magenta", "gold"] as const).map((projection) => (
              <button
                key={projection}
                type="button"
                onClick={() => setState((current) => ({ ...current, projection }))}
              >
                {projection}
              </button>
            ))}
          </div>
          <label className="projected-three-slider">
            <span>
              opacity <strong>{state.opacity}</strong>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={state.opacity}
              onChange={(event) => setState((current) => ({ ...current, opacity: Number(event.target.value) }))}
            />
          </label>
        </div>
      </div>
    </main>
  );
}
