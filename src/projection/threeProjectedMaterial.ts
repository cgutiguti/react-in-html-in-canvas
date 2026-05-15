import * as THREE from "three";

type ProjectorRecord = {
  id: string;
  uniforms: ThreeHtmlProjector["uniforms"];
};

type ProjectableMaterial = THREE.Material & {
  __htmlProjectors?: ProjectorRecord[];
  __htmlProjectorBaseOnBeforeCompile?: THREE.Material["onBeforeCompile"];
};

export type ThreeHtmlProjector = {
  camera: THREE.Camera;
  uniforms: {
    projectedTexture: { value: THREE.Texture };
    projectorViewMatrix: { value: THREE.Matrix4 };
    projectorProjectionMatrix: { value: THREE.Matrix4 };
    projectorPosition: { value: THREE.Vector3 };
    projectionOpacity: { value: number };
    hitboxRects: { value: Float32Array };
    hitboxCount: { value: number };
    hitboxOpacity: { value: number };
  };
  applyTo(mesh: THREE.Mesh): void;
  update(): void;
};

export function createThreeHtmlProjector({
  camera,
  texture,
  opacity = 1,
}: {
  camera: THREE.Camera;
  texture: THREE.Texture;
  opacity?: number;
}): ThreeHtmlProjector {
  const record: ProjectorRecord = {
    id: Math.random().toString(36).slice(2),
    uniforms: {
      projectedTexture: { value: texture },
      projectorViewMatrix: { value: new THREE.Matrix4() },
      projectorProjectionMatrix: { value: new THREE.Matrix4() },
      projectorPosition: { value: new THREE.Vector3() },
      projectionOpacity: { value: opacity },
      hitboxRects: { value: new Float32Array(16 * 4) },
      hitboxCount: { value: 0 },
      hitboxOpacity: { value: 0 },
    },
  };

  const projector: ThreeHtmlProjector = {
    camera,
    uniforms: record.uniforms,
    applyTo(mesh) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!material) continue;
        installProjector(material as ProjectableMaterial, record);
      }
    },
    update() {
      camera.updateMatrixWorld();
      record.uniforms.projectorViewMatrix.value.copy(camera.matrixWorldInverse);
      record.uniforms.projectorProjectionMatrix.value.copy(camera.projectionMatrix);
      record.uniforms.projectorPosition.value.setFromMatrixPosition(camera.matrixWorld);
    },
  };

  projector.update();
  return projector;
}

function installProjector(material: ProjectableMaterial, record: ProjectorRecord) {
  material.__htmlProjectors ??= [];
  if (!material.__htmlProjectors.some((projector) => projector.id === record.id)) {
    material.__htmlProjectors.push(record);
  }

  if (!material.__htmlProjectorBaseOnBeforeCompile) {
    material.__htmlProjectorBaseOnBeforeCompile = material.onBeforeCompile;
  }

  material.onBeforeCompile = (shader, renderer) => {
    material.__htmlProjectorBaseOnBeforeCompile?.(shader, renderer);
    const records = material.__htmlProjectors ?? [];

    let vertexCommon = "";
    let vertexBegin = "";
    let fragmentCommon = "";
    let colorFragment = "";

    for (const projector of records) {
      const keys = getShaderKeys(projector.id);
      shader.uniforms[keys.texture] = projector.uniforms.projectedTexture;
      shader.uniforms[keys.viewMatrix] = projector.uniforms.projectorViewMatrix;
      shader.uniforms[keys.projectionMatrix] = projector.uniforms.projectorProjectionMatrix;
      shader.uniforms[keys.position] = projector.uniforms.projectorPosition;
      shader.uniforms[keys.opacity] = projector.uniforms.projectionOpacity;
      shader.uniforms[keys.hitboxRects] = projector.uniforms.hitboxRects;
      shader.uniforms[keys.hitboxCount] = projector.uniforms.hitboxCount;
      shader.uniforms[keys.hitboxOpacity] = projector.uniforms.hitboxOpacity;

      vertexCommon += `
        uniform mat4 ${keys.viewMatrix};
        uniform mat4 ${keys.projectionMatrix};
        uniform vec3 ${keys.position};
        varying vec4 ${keys.coord};
        varying vec3 ${keys.dir};
        varying vec3 ${keys.normal};
      `;

      vertexBegin += `
        ${keys.coord} = ${keys.projectionMatrix} * ${keys.viewMatrix} * projectorWorld;
        ${keys.dir} = normalize(${keys.position} - projectorWorld.xyz);
        ${keys.normal} = normalize(mat3(modelMatrix) * normal);
      `;

      fragmentCommon += `
        uniform sampler2D ${keys.texture};
        uniform float ${keys.opacity};
        uniform vec4 ${keys.hitboxRects}[16];
        uniform int ${keys.hitboxCount};
        uniform float ${keys.hitboxOpacity};
        varying vec4 ${keys.coord};
        varying vec3 ${keys.dir};
        varying vec3 ${keys.normal};
      `;

      colorFragment += `
        vec3 projectorNdc_${projector.id} = ${keys.coord}.xyz / ${keys.coord}.w;
        vec2 projectorUv_${projector.id} = projectorNdc_${projector.id}.xy * 0.5 + 0.5;
        float inProjectorFrustum_${projector.id} =
          step(0.0, projectorUv_${projector.id}.x) * step(projectorUv_${projector.id}.x, 1.0) *
          step(0.0, projectorUv_${projector.id}.y) * step(projectorUv_${projector.id}.y, 1.0) *
          step(-1.0, projectorNdc_${projector.id}.z) * step(projectorNdc_${projector.id}.z, 1.0);
        float projectorFacing_${projector.id} = step(0.0, dot(${keys.normal}, ${keys.dir}));
        vec4 projectedColor_${projector.id} = texture2D(${keys.texture}, projectorUv_${projector.id});
        float projectorMask_${projector.id} =
          inProjectorFrustum_${projector.id} * projectorFacing_${projector.id} *
          projectedColor_${projector.id}.a * ${keys.opacity};
        diffuseColor.rgb = mix(diffuseColor.rgb, projectedColor_${projector.id}.rgb, projectorMask_${projector.id});
        float hitboxMask_${projector.id} = 0.0;
        for (int hitboxIndex = 0; hitboxIndex < 16; hitboxIndex++) {
          if (hitboxIndex >= ${keys.hitboxCount}) {
            break;
          }
          vec4 rect = ${keys.hitboxRects}[hitboxIndex];
          float insideRect =
            step(rect.x, projectorUv_${projector.id}.x) * step(projectorUv_${projector.id}.x, rect.z) *
            step(rect.y, projectorUv_${projector.id}.y) * step(projectorUv_${projector.id}.y, rect.w);
          hitboxMask_${projector.id} = max(hitboxMask_${projector.id}, insideRect);
        }
        diffuseColor.rgb = mix(
          diffuseColor.rgb,
          vec3(1.0, 0.82, 0.05),
          hitboxMask_${projector.id} * inProjectorFrustum_${projector.id} * projectorFacing_${projector.id} * ${keys.hitboxOpacity}
        );
      `;
    }

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${vertexCommon}`)
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vec4 projectorWorld = modelMatrix * vec4(transformed, 1.0);
         ${vertexBegin}`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${fragmentCommon}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${colorFragment}`);
  };

  material.needsUpdate = true;
}

function getShaderKeys(id: string) {
  return {
    texture: `projectedTexture_${id}`,
    viewMatrix: `projectorViewMatrix_${id}`,
    projectionMatrix: `projectorProjectionMatrix_${id}`,
    position: `projectorPosition_${id}`,
    opacity: `projectionOpacity_${id}`,
    hitboxRects: `projectedHitboxRects_${id}`,
    hitboxCount: `projectedHitboxCount_${id}`,
    hitboxOpacity: `projectedHitboxOpacity_${id}`,
    coord: `vProjectedCoord_${id}`,
    dir: `vProjectorDir_${id}`,
    normal: `vProjectorNormal_${id}`,
  };
}
