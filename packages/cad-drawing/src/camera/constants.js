const INITIAL_3D_REFERENCE_EYE = [150, -180, 233]
const INITIAL_3D_DISTANCE_SCALE = 0.1
const INITIAL_3D_ORBIT_Z_DEG = 290

const makeInitial3dCameraPosition = () => {
  const sx = INITIAL_3D_REFERENCE_EYE[0] * INITIAL_3D_DISTANCE_SCALE
  const sy = INITIAL_3D_REFERENCE_EYE[1] * INITIAL_3D_DISTANCE_SCALE
  const sz = INITIAL_3D_REFERENCE_EYE[2] * INITIAL_3D_DISTANCE_SCALE
  const rad = (INITIAL_3D_ORBIT_Z_DEG * Math.PI) / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  const xr = sx * c - sy * s
  const yr = sx * s + sy * c
  return [xr, yr, sz]
}

const INITIAL_3D_CAMERA_POSITION = makeInitial3dCameraPosition()
const DEFAULT_3D_FOV = Math.PI / 4
const CAD_2D_DISTANCE = 1000
const DEFAULT_CAD_2D_UNITS_PER_PIXEL = 0.05

const CAD_2D_AXES = {
  xy: {
    right: [1, 0, 0],
    up: [0, 1, 0],
    normal: [0, 0, 1],
    coords: [0, 1]
  },
  xz: {
    right: [1, 0, 0],
    up: [0, 0, 1],
    normal: [0, -1, 0],
    coords: [0, 2]
  },
  yz: {
    right: [0, 1, 0],
    up: [0, 0, 1],
    normal: [1, 0, 0],
    coords: [1, 2]
  }
}

module.exports = {
  CAD_2D_AXES,
  CAD_2D_DISTANCE,
  DEFAULT_3D_FOV,
  DEFAULT_CAD_2D_UNITS_PER_PIXEL,
  INITIAL_3D_CAMERA_POSITION
}
