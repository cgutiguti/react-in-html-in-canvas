# React HTML-in-Canvas Sphere Experiment

This demo renders a TypeScript React control panel built from shadcn-style primitives and Tailwind CSS, then uses WebGL to project the panel texture onto a side-lit sphere.

## Run

```bash
npm install
npm run dev -- --port 5174
```

Open <http://127.0.0.1:5174/>.

## Native HTML-in-canvas path

As of May 15, 2026, HTML-in-canvas is still experimental. The active API is described by the WICG explainer and WHATWG PR, not yet by the merged HTML Living Standard.

To test the native path:

1. Use Chrome Canary.
2. Enable `chrome://flags/#canvas-draw-element`.
3. Reload the app.

The native path uses:

- `<canvas layoutsubtree>`
- a React DOM subtree as a direct child of the canvas
- `canvas.requestPaint`
- `WebGL2RenderingContext.texElementImage2D(...)` when available

When those APIs are missing, the app keeps the same React component live as an overlay and mirrors its state into a canvas-generated texture so the sphere remains useful in stable browsers.

## Notes

The React UI demonstrates ordinary React behavior: state updates, controlled inputs, sliders, buttons, switches, memoized derived values, and a `useEffect` interval. A true curved sphere creates non-affine hit testing; the browser API can align hit testing for planar transforms, while fully curved interaction requires custom ray/UV pointer routing or smaller planar patches.

## Projection Engine Shape

Projection and hit routing now use a small scene abstraction in `src/projection/`:

- `ProjectionSurface` owns inverse hit testing from canvas pointer events back to panel-local DOM coordinates.
- `ProjectionScene` can contain multiple surfaces and returns the first matching hit.
- The current sphere is one surface implementation in `sphereSurface.ts`.
- Shader placement is supplied by the same surface object via GLSL snippets, keeping visual projection and pointer routing tied to one contract.

The intended growth path is to add more `ProjectionSurface` implementations for planes, meshes, lens/anamorphic projections, or multi-surface scenes. Each surface needs an inverse hit test and renderer-facing projection data.

### Three.js Projector Surfaces

The repo includes a Three.js adapter patterned after `three-html-to-canvas`:

- `createThreeHtmlProjector(...)` patches Three materials so a texture is projected from a projector camera onto arbitrary meshes.
- `createThreeProjectorSurface(...)` uses the same projector camera plus a render camera and raycast objects to invert pointer hits back into panel-local DOM coordinates.

Sketch:

```ts
const projector = createThreeHtmlProjector({
  camera: projectorCamera,
  texture: htmlCanvasTexture,
});

for (const mesh of projectedMeshes) {
  projector.applyTo(mesh);
}

const scene = createProjectionScene([
  createThreeProjectorSurface({
    renderCamera,
    projectorCamera,
    objects: projectedMeshes,
    rendererDomElement: renderer.domElement,
  }),
]);
```

For interaction, the shared DOM router calls `scene.inverseHitTest(...)`, then uses the same `domHitTest` helpers as the sphere demo. This is the pattern to follow for arbitrary surfaces: render projection and hit projection must share the same projector/camera/lens state.

Primary references:

- https://wicg.github.io/html-in-canvas/
- https://github.com/WICG/html-in-canvas
- https://github.com/whatwg/html/pull/11588
