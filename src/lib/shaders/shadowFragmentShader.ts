export const shadowFragmentShader = `
precision mediump float;
vec4 encodeDepth(float value) {
  vec4 bitShift = vec4(1.0, 255.0, 65025.0, 16581375.0);
  vec4 bitMask = vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0);
  vec4 rgbaDepth = fract(value * bitShift);
  rgbaDepth -= rgbaDepth.yzww * bitMask;
  return rgbaDepth;
}
void main() {
  gl_FragColor = encodeDepth(gl_FragCoord.z);
}
`;
