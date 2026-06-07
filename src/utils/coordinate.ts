import type { MapPoint } from "../types/project";

export const MAP_WIDTH = 1600;
export const MAP_HEIGHT = 900;

export function clampPoint(point: MapPoint): MapPoint {
  return {
    x: Math.min(1, Math.max(0, point.x)),
    y: Math.min(1, Math.max(0, point.y)),
  };
}

export function relativeToCanvas(point: MapPoint, width = MAP_WIDTH, height = MAP_HEIGHT) {
  return {
    x: point.x * width,
    y: point.y * height,
  };
}

export function canvasToRelative(point: MapPoint, width = MAP_WIDTH, height = MAP_HEIGHT) {
  return clampPoint({
    x: point.x / width,
    y: point.y / height,
  });
}

export function pointsToCanvas(points: MapPoint[], width = MAP_WIDTH, height = MAP_HEIGHT) {
  return points.flatMap((point) => [point.x * width, point.y * height]);
}
