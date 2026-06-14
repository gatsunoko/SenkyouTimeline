import { useEffect, useState } from "react";
import { Arrow, Circle, Line, Path, Rect } from "react-konva";

const DASH = [8, 8];

function useMarchingOffset(active: boolean) {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!active) {
      setOffset(0);
      return;
    }
    let frameId = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      setOffset(((now - startedAt) / 45) % 16);
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [active]);

  return offset;
}

type RectSelectionProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius?: number;
  active?: boolean;
  strokeWidth?: number;
  opacity?: number;
};

export function MarchingAntsRect({ x, y, width, height, cornerRadius = 0, active = true, strokeWidth = 3, opacity = 1 }: RectSelectionProps) {
  const offset = useMarchingOffset(active);
  return (
    <>
      <Rect x={x} y={y} width={width} height={height} stroke="#ffffff" strokeWidth={strokeWidth} dash={DASH} dashOffset={offset} cornerRadius={cornerRadius} opacity={opacity} listening={false} />
      <Rect x={x} y={y} width={width} height={height} stroke="#111827" strokeWidth={strokeWidth} dash={DASH} dashOffset={offset + 8} cornerRadius={cornerRadius} opacity={opacity} listening={false} />
    </>
  );
}

type CircleSelectionProps = {
  radius: number;
  opacity?: number;
};

export function MarchingAntsCircle({ radius, opacity = 1 }: CircleSelectionProps) {
  const offset = useMarchingOffset(true);
  return (
    <>
      <Circle radius={radius} stroke="#ffffff" strokeWidth={2} dash={DASH} dashOffset={offset} opacity={opacity} listening={false} />
      <Circle radius={radius} stroke="#111827" strokeWidth={2} dash={DASH} dashOffset={offset + 8} opacity={opacity} listening={false} />
    </>
  );
}

type LineSelectionProps = {
  points: number[];
  strokeWidth: number;
  dash?: number[];
  lineCap?: "butt" | "round" | "square";
  lineJoin?: "round" | "bevel" | "miter";
  tension?: number;
};

export function MarchingAntsLine({ points, strokeWidth, lineCap = "round", lineJoin = "round", tension = 0 }: LineSelectionProps) {
  const offset = useMarchingOffset(true);
  return (
    <>
      <Line points={points} stroke="#111827" strokeWidth={strokeWidth} lineCap={lineCap} lineJoin={lineJoin} tension={tension} listening={false} />
      <Line points={points} stroke="#ffffff" strokeWidth={strokeWidth} dash={DASH} dashOffset={offset} lineCap="butt" lineJoin={lineJoin} tension={tension} listening={false} />
    </>
  );
}

type ArrowSelectionProps = LineSelectionProps & {
  pointerLength: number;
  pointerWidth: number;
};

export function MarchingAntsArrow({ points, strokeWidth, pointerLength, pointerWidth, lineCap = "round", lineJoin = "round", tension = 0 }: ArrowSelectionProps) {
  const offset = useMarchingOffset(true);
  return (
    <>
      <Arrow points={points} stroke="#111827" fill="#111827" strokeWidth={strokeWidth} pointerLength={pointerLength} pointerWidth={pointerWidth} lineCap={lineCap} lineJoin={lineJoin} tension={tension} listening={false} />
      <Arrow
        points={points}
        stroke="#ffffff"
        fill="transparent"
        strokeWidth={strokeWidth}
        pointerLength={pointerLength}
        pointerWidth={pointerWidth}
        dash={DASH}
        dashOffset={offset}
        lineCap="butt"
        lineJoin={lineJoin}
        tension={tension}
        listening={false}
      />
    </>
  );
}

type ArrowPathSelectionProps = {
  pathData: string;
  headPoints: number[];
  strokeWidth: number;
};

export function MarchingAntsArrowPath({ pathData, headPoints, strokeWidth }: ArrowPathSelectionProps) {
  const offset = useMarchingOffset(true);
  return (
    <>
      {pathData && (
        <>
          <Path data={pathData} stroke="#111827" strokeWidth={strokeWidth} lineCap="round" lineJoin="round" listening={false} />
          <Path data={pathData} stroke="#ffffff" strokeWidth={strokeWidth} dash={DASH} dashOffset={offset} lineCap="butt" lineJoin="round" listening={false} />
        </>
      )}
      <Line points={headPoints} fill="#111827" stroke="#111827" strokeWidth={strokeWidth} closed lineJoin="round" listening={false} />
      <Line points={headPoints} fill="transparent" stroke="#ffffff" strokeWidth={strokeWidth} dash={DASH} dashOffset={offset} closed lineJoin="round" listening={false} />
    </>
  );
}
