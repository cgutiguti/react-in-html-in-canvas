import { useCallback, useEffect, useRef, useState } from "react";
import { createEngine, loadSceneModel, type Engine } from "./engine";
import { describeTarget } from "../projection/domHitTest";
import { HtmlToCanvasTexture } from "../projection/htmlToCanvasTexture";
import { createProjectedDomViewport, type ProjectedDomViewport } from "../projection/projectedDomViewport";
import type { Vec3, ViewState } from "../types/projector";

type ProjectedPick = { u: number; v: number; receiverId: number };

export function useHtmlInCanvasController({
  panelCss,
  panelSize,
}: {
  panelCss: string;
  panelSize: { width: number; height: number };
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const projectionSourceRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<ProjectedDomViewport | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const routingRef = useRef(false);
  const orbitRef = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });
  const [status, setStatus] = useState("renderer readying");
  const [viewState, setViewState] = useState<ViewState | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const projectionSource = projectionSourceRef.current;
    const panel = panelRef.current;
    if (!canvas || !projectionSource || !panel) return;

    const texture = new HtmlToCanvasTexture(panel, { ...panelSize, pixelRatio: 2 });
    viewportRef.current = createProjectedDomViewport(panel);
    canvas.setAttribute("layoutsubtree", "");
    canvas.layoutSubtree = true;
    const engine = createEngine(canvas, projectionSource, texture.canvas);
    engineRef.current = engine;
    setViewState(engine.getViewState());
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
    void loadSceneModel().then((sceneMesh) => {
      if (disposed || engineRef.current !== engine) return;
      engine.setSceneMesh(sceneMesh);
      engine.render();
      setStatus("loaded original GLB geometry");
    }).catch((error) => {
      console.warn("[engine] original GLB load failed; using procedural fallback", error);
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
        setViewState(engine.getViewState());
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
      setViewState(engine.getViewState());
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
      engine.dispose();
      if (engineRef.current === engine) engineRef.current = null;
      if (viewportRef.current?.getCapturedTarget()) viewportRef.current.releasePointer(0);
      if (viewportRef.current) viewportRef.current = null;
      setViewState(null);
    };
  }, [panelCss, panelSize]);

  const orbitFromGizmo = useCallback((dx: number, dy: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.orbit(dx, dy);
    engine.render();
    setViewState(engine.getViewState());
  }, []);

  const snapView = useCallback((direction: Vec3) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.snapView(direction);
    engine.render();
    setViewState(engine.getViewState());
  }, []);

  const resetView = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.resetView();
    engine.render();
    setViewState(engine.getViewState());
  }, []);

  const setHitMapVisible = useCallback((visible: boolean) => {
    engineRef.current?.setHitMapVisible(visible);
    engineRef.current?.render();
  }, []);

  return {
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
  };
}
