import * as THREE from "three";

export interface ZoneConfig {
  id: string;
  azDeg: number;
  elDeg: number;
  w: number;
  h: number;
}

// Interior positions — camera at origin, planes at R=5 (used by MouthPanorama 360 view)
export const ZONE_CONFIGS: ZoneConfig[] = [
  { id: "FRONT_SMILE",  azDeg:   0, elDeg:   0, w: 5.0, h: 3.75 },
  { id: "UPPER_ARCH",   azDeg:   0, elDeg:  55, w: 5.5, h: 3.50 },
  { id: "LOWER_ARCH",   azDeg:   0, elDeg: -55, w: 5.5, h: 3.50 },
  { id: "LEFT_BITE",    azDeg: -60, elDeg:   0, w: 5.0, h: 3.75 },
  { id: "RIGHT_BITE",   azDeg:  60, elDeg:   0, w: 5.0, h: 3.75 },
  { id: "UPPER_CLOSE",  azDeg:   0, elDeg:  20, w: 4.5, h: 3.40 },
  { id: "LOWER_CLOSE",  azDeg:   0, elDeg: -20, w: 4.5, h: 3.40 },
];

// Exterior positions — camera outside at ~z=4.5, planes at R=7 behind the teeth
// azDeg shifted by 180° so planes appear on the far side of the model as backdrops
export const EXTERIOR_ZONE_CONFIGS: ZoneConfig[] = ZONE_CONFIGS.map((cfg) => ({
  ...cfg,
  azDeg: cfg.azDeg + 180,
  w: cfg.w * 1.4,
  h: cfg.h * 1.4,
}));

export const SPHERE_R = 5;
export const BACKDROP_R = 7;

/** Converts azimuth + elevation angles to a plane's 3D position and Euler rotation
 *  so the front face points toward the origin (toward the viewer). */
export function zoneTransform(
  azDeg: number,
  elDeg: number,
  R: number
): { position: [number, number, number]; rotation: [number, number, number] } {
  const az = (azDeg * Math.PI) / 180;
  const el = (elDeg * Math.PI) / 180;
  const x = R * Math.sin(az) * Math.cos(el);
  const y = R * Math.sin(el);
  const z = R * Math.cos(az) * Math.cos(el);
  const dummy = new THREE.Object3D();
  dummy.position.set(x, y, z);
  dummy.lookAt(0, 0, 0);
  dummy.rotateY(Math.PI);
  return {
    position: [x, y, z],
    rotation: [dummy.rotation.x, dummy.rotation.y, dummy.rotation.z],
  };
}
