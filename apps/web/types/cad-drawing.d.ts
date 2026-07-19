declare module '@structures/cad-drawing/section2d' {
  export type SectionCamera2d = {
    target: [number, number]
    unitsPerPixel: number
  }

  export type ScreenPoint = {
    x: number
    y: number
  }

  export function createSectionCamera2d(patch?: Partial<SectionCamera2d>): SectionCamera2d
  export function fitSectionCamera2dToPoints(
    points: ScreenPoint[],
    size: { width: number; height: number },
    padding?: number
  ): SectionCamera2d
  export function panSectionCamera2d(camera: SectionCamera2d, delta: ScreenPoint): SectionCamera2d
  export function screenToWorld(
    camera: SectionCamera2d,
    point: ScreenPoint,
    size: { width: number; height: number }
  ): ScreenPoint
  export function snapWorldPoint(point: ScreenPoint, spacing?: number): ScreenPoint
  export function worldToScreen(
    camera: SectionCamera2d,
    point: ScreenPoint,
    size: { width: number; height: number }
  ): ScreenPoint
  export function zoomSectionCamera2d(
    camera: SectionCamera2d,
    wheelDelta: number,
    anchor: ScreenPoint,
    size: { width: number; height: number },
    speed?: number
  ): SectionCamera2d
}
