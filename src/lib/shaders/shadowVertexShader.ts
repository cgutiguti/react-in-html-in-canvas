export const shadowVertexShader = `
attribute vec3 aPosition;
uniform mat4 uShadowViewProjection;
void main() {
  gl_Position = uShadowViewProjection * vec4(aPosition, 1.0);
}
`;
