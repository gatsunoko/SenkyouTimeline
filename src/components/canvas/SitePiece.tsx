import { Group, Rect, Text } from "react-konva";
import { siteTypeIcons } from "../../data/pieceTemplates";
import type { Site } from "../../types/project";
import { relativeToCanvas } from "../../utils/coordinate";

interface SitePieceProps {
  site: Site;
  selected: boolean;
  color: string;
  onSelect: () => void;
}

export function SitePiece({ site, selected, color, onSelect }: SitePieceProps) {
  const position = relativeToCanvas(site);
  const opacity = site.certainty === "uncertain" ? 0.55 : 0.94;
  return (
    <Group x={position.x} y={position.y} opacity={opacity} onClick={onSelect} onTap={onSelect}>
      {selected && <Rect x={-34} y={-34} width={68} height={68} stroke="#f4d06f" strokeWidth={3} cornerRadius={8} />}
      <Rect x={-28} y={-25} width={56} height={50} fill="#101822" stroke={color} strokeWidth={3} cornerRadius={7} shadowBlur={8} shadowColor="#000" shadowOpacity={0.28} />
      <Text text={siteTypeIcons[site.siteType]} x={-24} y={-17} width={48} align="center" fontSize={20} fontStyle="bold" fill="#fff7e6" />
      <Text text={site.name} x={-60} y={30} width={120} align="center" fontSize={14} fill="#f5efe3" />
      {site.certainty === "fictional" && <Text text="仮" x={22} y={-34} width={24} align="center" fontSize={12} fontStyle="bold" fill="#f4d06f" />}
    </Group>
  );
}
