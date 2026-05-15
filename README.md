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

Primary references:

- https://wicg.github.io/html-in-canvas/
- https://github.com/WICG/html-in-canvas
- https://github.com/whatwg/html/pull/11588
