import { Arrow } from "react-konva";
import type { BattleArrow } from "../../types/project";
import { pointsToCanvas } from "../../utils/coordinate";

interface ArrowShapeProps {
  arrow: BattleArrow;
  selected: boolean;
  onSelect: () => void;
}

export function ArrowShape({ arrow, selected, onSelect }: ArrowShapeProps) {
  if (!arrow.visible || arrow.points.length < 2) return null;
  return (
    <Arrow
      points={pointsToCanvas(arrow.points)}
      stroke={selected ? "#f4d06f" : arrow.color}
      fill={selected ? "#f4d06f" : arrow.color}
      strokeWidth={selected ? arrow.width + 2 : arrow.width}
      pointerLength={20}
      pointerWidth={18}
      opacity={arrow.certainty === "uncertain" ? arrow.opacity * 0.5 : arrow.opacity}
      dash={arrow.dashed || arrow.certainty === "uncertain" ? [15, 10] : undefined}
      lineCap="round"
      lineJoin="round"
      onClick={onSelect}
      onTap={onSelect}
    />
  );
}
