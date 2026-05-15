interface Window {
  __htmlInCanvasStatus?: {
    nativeApisAvailable: boolean;
    nativeUploadSucceeded: boolean;
    elementCaptured: boolean;
    lastNativeError: string;
  };
  __projectionRouterStatus?: {
    hit: boolean;
    x: number;
    y: number;
    u: number;
    v: number;
    target: string;
  };
}
