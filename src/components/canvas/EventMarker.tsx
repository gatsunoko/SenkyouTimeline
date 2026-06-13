import { Circle, Group, Text } from "react-konva";
import { UI_FONT_FAMILY } from "../../constants/fonts";
import type { BattleEvent } from "../../types/project";
import { relativeToCanvas } from "../../utils/coordinate";

interface EventMarkerProps {
  event: BattleEvent;
  selected: boolean;
  mapWidth: number;
  mapHeight: number;
  onSelect: () => void;
}

export function EventMarker({ event, selected, mapWidth, mapHeight, onSelect }: EventMarkerProps) {
  const position = relativeToCanvas(event, mapWidth, mapHeight);
  return (
    <Group x={position.x} y={position.y} opacity={0.95} onClick={onSelect} onTap={onSelect}>
      <Circle radius={selected ? 17 : 13} fill="#e35d4f" stroke={selected ? "#f4d06f" : "#fff7e6"} strokeWidth={selected ? 4 : 2} />
      <Text text="!" x={-5} y={-10} width={10} align="center" fontSize={18} fontFamily={UI_FONT_FAMILY} fontStyle="bold" fill="#fff7e6" />
      <Text text={event.title} x={-80} y={18} width={160} align="center" fontSize={14} fontFamily={UI_FONT_FAMILY} fill="#fff7e6" />
    </Group>
  );
}
