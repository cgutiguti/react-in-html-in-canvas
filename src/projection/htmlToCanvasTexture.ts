import * as THREE from "three";

export class HtmlToCanvasTexture {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;

  private readonly context: CanvasRenderingContext2D;
  private rendering = false;
  private pending = false;

  constructor(
    private readonly element: HTMLElement,
    private readonly options: { width: number; height: number; pixelRatio?: number },
  ) {
    this.canvas = document.createElement("canvas");
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("Could not create 2D canvas context for HTML texture.");
    this.context = context;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
  }

  resize(width: number, height: number) {
    this.options.width = width;
    this.options.height = height;
  }

  getSize() {
    return {
      cssWidth: this.options.width,
      cssHeight: this.options.height,
      canvasWidth: this.canvas.width,
      canvasHeight: this.canvas.height,
      pixelRatio: this.options.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2),
    };
  }

  async update(css = "") {
    if (this.rendering) {
      this.pending = true;
      return;
    }

    this.rendering = true;
    try {
      do {
        this.pending = false;
        const pixelRatio = this.options.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.floor(this.options.width * pixelRatio));
        const height = Math.max(1, Math.floor(this.options.height * pixelRatio));
        if (this.canvas.width !== width || this.canvas.height !== height) {
          this.canvas.width = width;
          this.canvas.height = height;
        }

        const image = new Image();
        image.src = this.createSvgUrl(css);
        await image.decode();
        this.context.clearRect(0, 0, width, height);
        this.context.drawImage(image, 0, 0, width, height);
        this.texture.needsUpdate = true;
      } while (this.pending);
    } finally {
      this.rendering = false;
    }
  }

  dispose() {
    this.texture.dispose();
  }

  private createSvgUrl(css: string) {
    const serialized = new XMLSerializer().serializeToString(this.element);
    const styleBlock = `<style xmlns="http://www.w3.org/1999/xhtml"><![CDATA[${css}]]></style>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${this.options.width}" height="${this.options.height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:${this.options.width}px;height:${this.options.height}px;">
          ${styleBlock}
          ${serialized}
        </div>
      </foreignObject>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
}
