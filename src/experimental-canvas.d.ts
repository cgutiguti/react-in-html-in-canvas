type ElementImage = {
  readonly width: number;
  readonly height: number;
  close(): void;
};

type CanvasPaintEvent = Event & {
  readonly changedElements?: Element[];
};

interface HTMLCanvasElement {
  layoutSubtree?: boolean;
  requestPaint?: () => void;
  captureElementImage?: (element: Element) => ElementImage;
  getElementTransform?: (element: Element | ElementImage, transform: DOMMatrix) => DOMMatrix;
  onpaint?: ((event: CanvasPaintEvent) => void) | null;
}

interface CanvasRenderingContext2D {
  drawElementImage?: (
    element: Element | ElementImage,
    dx: number,
    dy: number,
    dWidth?: number,
    dHeight?: number,
  ) => DOMMatrix;
}

interface WebGLRenderingContext {
  texElementImage2D?: (
    target: number,
    level: number,
    internalformat: number,
    format: number,
    type: number,
    element: Element | ElementImage,
  ) => void;
}

interface WebGL2RenderingContext {
  texElementImage2D?: WebGLRenderingContext["texElementImage2D"];
}
