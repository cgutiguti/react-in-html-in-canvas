import { dot, normalize } from "./math";
import type { PanelHit, ProjectionContext, ProjectionSurface, Vec3 } from "./types";

type SpherePanelProjection = {
  uStart: number;
  uSpan: number;
  vStart: number;
  vSpan: number;
  minZ: number;
};

const spherePanelProjection: SpherePanelProjection = {
  uStart: 0.72,
  uSpan: 0.18,
  vStart: 0.14,
  vSpan: 0.44,
  minZ: 0.32,
};

export function createSpherePanelSurface(): ProjectionSurface {
  return {
    id: "sphere-panel",
    renderer: "webgl-fragment",
    inverseHitTest(context) {
      return mapCanvasPointToSpherePanel(context, spherePanelProjection);
    },
    glslPanelUv: `vec2(
        1.0 - ((u - ${spherePanelProjection.uStart.toFixed(2)}) / ${spherePanelProjection.uSpan.toFixed(2)}),
        (v - ${spherePanelProjection.vStart.toFixed(2)}) / ${spherePanelProjection.vSpan.toFixed(2)}
      )`,
    glslOnSurface: `panelUv.x > 0.0 && panelUv.x < 1.0 && panelUv.y > 0.0 && panelUv.y < 1.0 && n.z > ${spherePanelProjection.minZ.toFixed(2)}`,
  };
}

function mapCanvasPointToSpherePanel(
  { event, canvas, panel }: ProjectionContext,
  projection: SpherePanelProjection,
): PanelHit | null {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const px = (event.clientX - rect.left) * dpr;
  const py = (rect.bottom - event.clientY) * dpr;
  const minAxis = Math.min(canvas.width, canvas.height);
  const p = {
    x: (px * 2 - canvas.width) / minAxis - 0.18,
    y: (py * 2 - canvas.height) / minAxis,
  };

  const rayOrigin: Vec3 = { x: 0, y: 0, z: 3.1 };
  const rayDirection = normalize({ x: p.x, y: p.y, z: -2.05 });
  const b = dot(rayOrigin, rayDirection);
  const c = dot(rayOrigin, rayOrigin) - 1;
  const h = b * b - c;
  if (h < 0) return null;

  const t = -b - Math.sqrt(h);
  const normal = normalize({
    x: rayOrigin.x + rayDirection.x * t,
    y: rayOrigin.y + rayDirection.y * t,
    z: rayOrigin.z + rayDirection.z * t,
  });

  const sphereU = Math.atan2(normal.z, normal.x) / (Math.PI * 2) + 0.5;
  const sphereV = Math.asin(normal.y) / Math.PI + 0.5;
  const panelU = 1 - (sphereU - projection.uStart) / projection.uSpan;
  const panelV = (sphereV - projection.vStart) / projection.vSpan;
  if (panelU <= 0 || panelU >= 1 || panelV <= 0 || panelV >= 1 || normal.z <= projection.minZ) {
    return null;
  }

  return {
    x: panelU * panel.offsetWidth,
    y: (1 - panelV) * panel.offsetHeight,
    u: panelU,
    v: panelV,
    surfaceId: "sphere-panel",
  };
}
