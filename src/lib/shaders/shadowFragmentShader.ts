export const shadowFragmentShader = `
precision mediump float;
const vec4 DEPTH_ENCODE_SHIFT = vec4(1.0, 255.0, 65025.0, 16581375.0);
const vec4 DEPTH_ENCODE_MASK = vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0);
vec4 encodeDepth(float value) {
  vec4 rgbaDepth = fract(value * DEPTH_ENCODE_SHIFT);
  rgbaDepth -= rgbaDepth.yzww * DEPTH_ENCODE_MASK;
  return rgbaDepth;
}
void main() {
  gl_FragColor = encodeDepth(gl_FragCoord.z);
}
`;
