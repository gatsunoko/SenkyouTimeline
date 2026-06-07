import { Group, Rect, Text } from "react-konva";
import type { MapLabel } from "../../types/project";
import { relativeToCanvas } from "../../utils/coordinate";

interface LabelShapeProps {
  label: MapLabel;
  selected: boolean;
  mapWidth: number;
  mapHeight: number;
  onSelect: () => void;
}

export function LabelShape({ label, selected, mapWidth, mapHeight, onSelect }: LabelShapeProps) {
  const position = relativeToCanvas(label, mapWidth, mapHeight);
  const textWidth = Array.from(label.text).reduce((sum, char) => {
    const wide = /[^\u0020-\u007e]/.test(char);
    return sum + label.fontSize * (wide ? 1.05 : 0.62);
  }, 0);
  const width = Math.max(70, textWidth + 24);
  const height = label.fontSize + 16;
  return (
    <Group x={position.x} y={position.y} visible={label.visible} opacity={label.opacity} onClick={onSelect} onTap={onSelect}>
      {selected && <Rect x={-width / 2 - 5} y={-height / 2 - 5} width={width + 10} height={height + 10} stroke="#f4d06f" strokeWidth={3} cornerRadius={6} />}
      <Rect x={-width / 2} y={-height / 2} width={width} height={height} fill={label.backgroundColor} cornerRadius={6} />
      <Text text={label.text} x={-width / 2 + 8} y={-height / 2 + 7} width={width - 16} align="center" fontSize={label.fontSize} fill={label.color} wrap="none" />
    </Group>
  );
}
