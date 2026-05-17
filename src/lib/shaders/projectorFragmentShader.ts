export const fragmentShader = `
precision mediump float;
uniform sampler2D uDomTexture;
uniform sampler2D uShadowMap;
uniform vec3 uLeftLight;
uniform vec3 uRightLight;
uniform vec3 uTopLight;
uniform float uAmbientFloor;
uniform float uLeftDiffuseGain;
uniform float uRightDiffuseGain;
uniform float uTopDiffuseGain;
uniform float uShadowStrength;
uniform float uShadowBias;
uniform float uShowHitMap;
uniform vec4 uProjectorUvFit;
varying vec3 vNormal;
varying vec4 vProjected;
varying vec4 vShadowCoord;
const vec3 HIT_MAP_COLOR = vec3(1.0, 0.84, 0.08);
const float HIT_MAP_ALPHA_THRESHOLD = 0.08;
const float HIT_MAP_BLEND = 0.22;
const vec4 DEPTH_DECODE = vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0);
float decodeDepth(vec4 rgbaDepth) {
  return dot(rgbaDepth, DEPTH_DECODE);
}
void main() {
  vec3 ndc = vProjected.xyz / vProjected.w;
  vec2 rawUv = ndc.xy * 0.5 + 0.5;
  vec2 uv = (rawUv - uProjectorUvFit.xy) / uProjectorUvFit.zw;
  float insideRaw =
    step(uProjectorUvFit.x, rawUv.x) * step(rawUv.x, uProjectorUvFit.x + uProjectorUvFit.z) *
    step(uProjectorUvFit.y, rawUv.y) * step(rawUv.y, uProjectorUvFit.y + uProjectorUvFit.w);
  float inside = insideRaw * step(-1.0, ndc.z) * step(ndc.z, 1.0);
  float leftDiffuse = max(dot(normalize(vNormal), uLeftLight), 0.0);
  float rightDiffuse = max(dot(normalize(vNormal), uRightLight), 0.0);
  float topDiffuse = max(dot(normalize(vNormal), uTopLight), 0.0);
  vec3 base = min(vec3(1.0), vec3(uAmbientFloor + leftDiffuse * uLeftDiffuseGain + rightDiffuse * uRightDiffuseGain + topDiffuse * uTopDiffuseGain));
  vec3 shadowNdc = vShadowCoord.xyz / vShadowCoord.w;
  vec2 shadowUv = shadowNdc.xy * 0.5 + 0.5;
  float shadowInside = step(0.0, shadowUv.x) * step(shadowUv.x, 1.0) * step(0.0, shadowUv.y) * step(shadowUv.y, 1.0) * step(-1.0, shadowNdc.z) * step(shadowNdc.z, 1.0);
  float currentDepth = shadowNdc.z * 0.5 + 0.5;
  float storedDepth = decodeDepth(texture2D(uShadowMap, shadowUv));
  float shadowed = step(storedDepth + uShadowBias, currentDepth) * shadowInside;
  base *= 1.0 - shadowed * uShadowStrength;
  vec4 projected = texture2D(uDomTexture, uv);
  vec3 color = mix(base, projected.rgb, projected.a * inside);
  if (uShowHitMap > 0.5 && inside > 0.5 && projected.a > HIT_MAP_ALPHA_THRESHOLD) {
    color = mix(color, HIT_MAP_COLOR, HIT_MAP_BLEND);
  }
  gl_FragColor = vec4(color, 1.0);
}
`;
