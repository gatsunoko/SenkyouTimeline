import { Group, Rect, Text } from "react-konva";
import { unitTypeIcons } from "../../data/pieceTemplates";
import type { Unit } from "../../types/project";
import type { ResolvedUnitFrame } from "../../utils/interpolation";
import { relativeToCanvas } from "../../utils/coordinate";

interface UnitPieceProps {
  unit: Unit;
  frame: ResolvedUnitFrame;
  color: string;
  selected: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
}

function readableTextColor(color: string) {
  const hex = color.replace("#", "");
  const value = hex.length === 3 ? hex.split("").map((char) => char + char).join("") : hex;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#10151d" : "#fffaf0";
}

export function UnitPiece({ unit, frame, color, selected, onSelect, onDragEnd }: UnitPieceProps) {
  const position = relativeToCanvas(frame);
  const width = 92 * unit.size;
  const height = 44 * unit.size;
  const opacity = frame.effectiveCertainty === "uncertain" ? 0.5 : 0.96;
  const textColor = readableTextColor(color);

  return (
    <Group
      x={position.x}
      y={position.y}
      rotation={frame.rotation}
      draggable={!unit.locked}
      opacity={opacity}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(event) => onDragEnd(event.target.x() / 1600, event.target.y() / 900)}
    >
      {selected && <Rect x={-width / 2 - 6} y={-height / 2 - 6} width={width + 12} height={height + 12} stroke="#f4d06f" strokeWidth={3} cornerRadius={8} />}
      <Rect x={-width / 2} y={-height / 2} width={width} height={height} fill={color} stroke="#1b1f29" strokeWidth={2} cornerRadius={8} shadowBlur={8} shadowColor="#000" shadowOpacity={0.35} />
      <Rect x={-width / 2 + 5} y={-height / 2 + 5} width={22} height={height - 10} fill="rgba(0,0,0,0.23)" cornerRadius={5} />
      <Text text={unitTypeIcons[unit.unitType]} x={-width / 2 + 5} y={-height / 2 + 9} width={22} align="center" fontSize={14 * unit.size} fontStyle="bold" fill={textColor} />
      <Text text={unit.shortName || unit.name} x={-width / 2 + 30} y={-height / 2 + 10} width={width - 35} align="center" fontSize={15 * unit.size} fontStyle="bold" fill={textColor} ellipsis />
      {frame.effectiveCertainty === "fictional" && (
        <>
          <Rect x={width / 2 - 24} y={-height / 2 - 14} width={28} height={18} fill="#f4d06f" cornerRadius={4} />
          <Text text="仮" x={width / 2 - 24} y={-height / 2 - 10} width={28} align="center" fontSize={12} fontStyle="bold" fill="#1a1d23" />
        </>
      )}
    </Group>
  );
}
