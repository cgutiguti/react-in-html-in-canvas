export const receiverPickFragmentShader = `
precision mediump float;
varying float vReceiverId;
const float BYTE_RANGE = 255.0;
void main() {
  gl_FragColor = vec4(vReceiverId / BYTE_RANGE, 0.0, 0.0, 1.0);
}
`;
