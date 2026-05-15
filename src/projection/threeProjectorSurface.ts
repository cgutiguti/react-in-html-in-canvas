import * as THREE from "three";
import type { PanelHit, ProjectionContext, ProjectionSurface } from "./types";

export type ThreeProjectorSurfaceOptions = {
  id?: string;
  renderCamera: THREE.Camera;
  projectorCamera: THREE.Camera;
  objects: THREE.Object3D[];
  recursive?: boolean;
  rendererDomElement?: HTMLElement;
  raycaster?: THREE.Raycaster;
  shouldAcceptHit?: (hit: THREE.Intersection) => boolean;
};

export type ThreeProjectorSurface = ProjectionSurface;

export function createThreeProjectorSurface(options: ThreeProjectorSurfaceOptions): ProjectionSurface {
  const raycaster = options.raycaster ?? new THREE.Raycaster();
  const recursive = options.recursive ?? true;

  return {
    id: options.id ?? "three-projector",
    renderer: "three-projector",
    inverseHitTest(context) {
      const viewportElement = options.rendererDomElement ?? context.canvas;
      const pointerNdc = getPointerNdc(context.event, viewportElement);

      options.renderCamera.updateMatrixWorld();
      options.projectorCamera.updateMatrixWorld();
      raycaster.setFromCamera(pointerNdc, options.renderCamera);

      const hits = raycaster.intersectObjects(options.objects, recursive);
      const hit = hits.find((candidate) => options.shouldAcceptHit?.(candidate) ?? true);
      if (!hit) return null;

      const projected = hit.point.clone().project(options.projectorCamera);
      if (
        projected.x < -1 ||
        projected.x > 1 ||
        projected.y < -1 ||
        projected.y > 1 ||
        projected.z < -1 ||
        projected.z > 1
      ) {
        return null;
      }

      const u = projected.x * 0.5 + 0.5;
      const v = projected.y * 0.5 + 0.5;

      return {
        x: u * context.panel.offsetWidth,
        y: (1 - v) * context.panel.offsetHeight,
        u,
        v,
        surfaceId: options.id ?? "three-projector",
      };
    },
  } satisfies ProjectionSurface;
}

function getPointerNdc(event: PointerEvent, element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -(((event.clientY - rect.top) / rect.height) * 2 - 1),
  );
}
