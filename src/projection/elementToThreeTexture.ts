import * as THREE from "three";
import { HtmlToCanvasTexture } from "./htmlToCanvasTexture";

type NativeTextureStatus = {
  mode: "native" | "fallback";
  nativeApisAvailable: boolean;
  nativeUploadSucceeded: boolean;
  elementCaptured: boolean;
  lastNativeError: string;
};

export class ElementToThreeTexture {
  readonly texture: THREE.CanvasTexture;

  private readonly fallback: HtmlToCanvasTexture;
  private status: NativeTextureStatus = {
    mode: "fallback",
    nativeApisAvailable: false,
    nativeUploadSucceeded: false,
    elementCaptured: false,
    lastNativeError: "",
  };

  constructor(
    private readonly element: HTMLElement,
    options: { width: number; height: number; pixelRatio?: number },
  ) {
    this.fallback = new HtmlToCanvasTexture(element, options);
    this.texture = this.fallback.texture;
  }

  async update(css: string, renderer?: THREE.WebGLRenderer) {
    await this.fallback.update(css);
    const canvas = renderer?.domElement as HTMLCanvasElement | undefined;
    const gl = renderer?.getContext() as WebGL2RenderingContext | undefined;
    const nativeApisAvailable = Boolean(canvas?.captureElementImage && gl?.texElementImage2D && canvas && "layoutSubtree" in canvas);
    this.status = {
      mode: "fallback",
      nativeApisAvailable,
      nativeUploadSucceeded: false,
      elementCaptured: false,
      lastNativeError:
        "Native element upload disabled: uploading texElementImage2D into a Three-managed CanvasTexture can create a GL texture/sampler format mismatch.",
    };
  }

  getSize() {
    return this.fallback.getSize();
  }

  getStatus() {
    return this.status;
  }

  dispose() {
    this.fallback.dispose();
  }
}
