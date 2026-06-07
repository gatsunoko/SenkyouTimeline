import { Line } from "react-konva";
import type { BattleLine, LineKeyframe } from "../../types/project";
import { pointsToCanvas } from "../../utils/coordinate";

interface LineShapeProps {
  line: BattleLine;
  frame: LineKeyframe;
  selected: boolean;
  onSelect: () => void;
}

export function LineShape({ line, frame, selected, onSelect }: LineShapeProps) {
  if (!frame.visible || frame.points.length < 2) return null;
  return (
    <Line
      points={pointsToCanvas(frame.points)}
      stroke={selected ? "#f4d06f" : line.color}
      strokeWidth={selected ? line.width + 3 : line.width}
      opacity={line.certainty === "uncertain" ? line.opacity * 0.5 : line.opacity}
      dash={line.dashed || line.certainty === "uncertain" ? [16, 10] : undefined}
      lineCap="round"
      lineJoin="round"
      onClick={onSelect}
      onTap={onSelect}
    />
  );
}
