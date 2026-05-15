export type Vec2 = {
  x: number;
  y: number;
};

export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type PanelHit = {
  x: number;
  y: number;
  u: number;
  v: number;
  surfaceId: string;
};

export type ProjectionContext = {
  canvas: HTMLCanvasElement;
  panel: HTMLElement;
  event: PointerEvent;
};

export type ProjectionSurface = {
  id: string;
  inverseHitTest(context: ProjectionContext): PanelHit | null;
  renderer?: "webgl-fragment" | "three-projector" | "custom";
  glslPanelUv?: string;
  glslOnSurface?: string;
};

export type ProjectionScene = {
  surfaces: ProjectionSurface[];
  inverseHitTest(context: ProjectionContext): PanelHit | null;
};
