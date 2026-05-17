export type Vec3 = [number, number, number];

export type ViewState = {
  yaw: number;
  pitch: number;
  radius: number;
  right: Vec3;
  up: Vec3;
  forward: Vec3;
};
