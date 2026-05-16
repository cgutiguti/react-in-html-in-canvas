import * as THREE from "three";

export type ThreeProjectorPickBuffer = {
  pick(clientX: number, clientY: number): { u: number; v: number } | null;
  getLastDebug(): ThreeProjectorPickDebug | null;
  resize(width: number, height: number): void;
  dispose(): void;
};

export type ThreeProjectorPickDebug = {
  clientX: number;
  clientY: number;
  readX: number;
  readY: number;
  drawingWidth: number;
  drawingHeight: number;
  pixel: [number, number, number, number];
  result: "hit" | "zero-pixel" | "outside-canvas" | "empty-canvas";
};

export function createThreeProjectorPickBuffer({
  renderer,
  scene,
  renderCamera,
  projectorCamera,
}: {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  renderCamera: THREE.Camera;
  projectorCamera: THREE.Camera;
}): ThreeProjectorPickBuffer {
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);

  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  let lastDebug: ThreeProjectorPickDebug | null = null;
  target.texture.colorSpace = THREE.NoColorSpace;

  const pixel = new Uint8Array(4);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      projectorViewMatrix: { value: new THREE.Matrix4() },
      projectorProjectionMatrix: { value: new THREE.Matrix4() },
      projectorPosition: { value: new THREE.Vector3() },
    },
    vertexShader: `
      uniform mat4 projectorViewMatrix;
      uniform mat4 projectorProjectionMatrix;
      uniform vec3 projectorPosition;
      varying vec4 vProjectedCoord;
      varying vec3 vProjectorDir;
      varying vec3 vWorldNormal;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vProjectedCoord = projectorProjectionMatrix * projectorViewMatrix * worldPosition;
        vProjectorDir = normalize(projectorPosition - worldPosition.xyz);
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec4 vProjectedCoord;
      varying vec3 vProjectorDir;
      varying vec3 vWorldNormal;

      vec2 encode16(float value) {
        float encodedValue = floor(clamp(value, 0.0, 1.0) * 65534.0) + 1.0;
        return vec2(floor(encodedValue / 256.0), mod(encodedValue, 256.0)) / 255.0;
      }

      void main() {
        vec3 projectorNdc = vProjectedCoord.xyz / vProjectedCoord.w;
        vec2 projectorUv = projectorNdc.xy * 0.5 + 0.5;
        bool inFrustum =
          projectorUv.x >= 0.0 && projectorUv.x <= 1.0 &&
          projectorUv.y >= 0.0 && projectorUv.y <= 1.0 &&
          projectorNdc.z >= -1.0 && projectorNdc.z <= 1.0;
        if (!inFrustum) {
          discard;
        }

        vec2 encodedU = encode16(projectorUv.x);
        vec2 encodedV = encode16(projectorUv.y);
        gl_FragColor = vec4(encodedU.x, encodedU.y, encodedV.x, encodedV.y);
      }
    `,
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });

  function renderPickPass() {
    projectorCamera.updateMatrixWorld();
    renderCamera.updateMatrixWorld();
    material.uniforms.projectorViewMatrix.value.copy(projectorCamera.matrixWorldInverse);
    material.uniforms.projectorProjectionMatrix.value.copy(projectorCamera.projectionMatrix);
    material.uniforms.projectorPosition.value.setFromMatrixPosition(projectorCamera.matrixWorld);

    const previousTarget = renderer.getRenderTarget();
    const previousClearColor = new THREE.Color();
    renderer.getClearColor(previousClearColor);
    const previousClearAlpha = renderer.getClearAlpha();
    const previousOverride = scene.overrideMaterial;

    scene.overrideMaterial = material;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, true);
    renderer.render(scene, renderCamera);

    scene.overrideMaterial = previousOverride;
    renderer.setClearColor(previousClearColor, previousClearAlpha);
    renderer.setRenderTarget(previousTarget);
  }

  return {
    pick(clientX, clientY) {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        lastDebug = {
          clientX,
          clientY,
          readX: 0,
          readY: 0,
          drawingWidth: 0,
          drawingHeight: 0,
          pixel: [0, 0, 0, 0],
          result: "empty-canvas",
        };
        return null;
      }

      renderPickPass();

      const drawingSize = new THREE.Vector2();
      renderer.getDrawingBufferSize(drawingSize);
      const x = clampInt(Math.floor(((clientX - rect.left) / rect.width) * drawingSize.x), 0, drawingSize.x - 1);
      const y = clampInt(Math.floor((1 - (clientY - rect.top) / rect.height) * drawingSize.y), 0, drawingSize.y - 1);
      if (x < 0 || x >= drawingSize.x || y < 0 || y >= drawingSize.y) {
        lastDebug = {
          clientX,
          clientY,
          readX: x,
          readY: y,
          drawingWidth: drawingSize.x,
          drawingHeight: drawingSize.y,
          pixel: [0, 0, 0, 0],
          result: "outside-canvas",
        };
        return null;
      }

      renderer.readRenderTargetPixels(target, x, y, 1, 1, pixel);
      const pixelTuple: [number, number, number, number] = [pixel[0], pixel[1], pixel[2], pixel[3]];
      if (pixel[0] === 0 && pixel[1] === 0 && pixel[2] === 0 && pixel[3] === 0) {
        lastDebug = {
          clientX,
          clientY,
          readX: x,
          readY: y,
          drawingWidth: drawingSize.x,
          drawingHeight: drawingSize.y,
          pixel: pixelTuple,
          result: "zero-pixel",
        };
        return null;
      }

      lastDebug = {
        clientX,
        clientY,
        readX: x,
        readY: y,
        drawingWidth: drawingSize.x,
        drawingHeight: drawingSize.y,
        pixel: pixelTuple,
        result: "hit",
      };

      return {
        u: decode16(pixel[0], pixel[1]),
        v: decode16(pixel[2], pixel[3]),
      };
    },
    getLastDebug() {
      return lastDebug;
    },
    resize(width, height) {
      const pixelRatio = renderer.getPixelRatio();
      target.setSize(Math.max(1, Math.floor(width * pixelRatio)), Math.max(1, Math.floor(height * pixelRatio)));
    },
    dispose() {
      material.dispose();
      target.dispose();
    },
  };
}

function decode16(high: number, low: number) {
  const packed = high * 256 + low;
  return Math.min(1, Math.max(0, (packed - 1) / 65534));
}

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
