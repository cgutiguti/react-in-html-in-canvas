export const vertexShader = `
attribute vec3 aPosition;
attribute vec3 aNormal;
uniform mat4 uViewProjection;
uniform mat4 uProjectorViewProjection;
uniform mat4 uShadowViewProjection;
varying vec3 vNormal;
varying vec4 vProjected;
varying vec4 vShadowCoord;
void main() {
  vec4 world = vec4(aPosition, 1.0);
  vNormal = normalize(aNormal);
  vProjected = uProjectorViewProjection * world;
  vShadowCoord = uShadowViewProjection * world;
  gl_Position = uViewProjection * world;
}
`;
