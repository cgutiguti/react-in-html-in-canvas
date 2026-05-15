import type { ProjectionContext, ProjectionScene, ProjectionSurface } from "./types";

export function createProjectionScene(surfaces: ProjectionSurface[]): ProjectionScene {
  return {
    surfaces,
    inverseHitTest(context: ProjectionContext) {
      for (const surface of surfaces) {
        const hit = surface.inverseHitTest(context);
        if (hit) return hit;
      }
      return null;
    },
  };
}
