import { useEffect, useState } from "react";
import { Group, Image as KonvaImage, Rect, Text } from "react-konva";
import type { Site } from "../../types/project";
import { relativeToCanvas } from "../../utils/coordinate";

interface SitePieceProps {
  site: Site;
  selected: boolean;
  color: string;
  mapWidth: number;
  mapHeight: number;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
}

export function SitePiece({ site, selected, color, mapWidth, mapHeight, onSelect, onDragEnd }: SitePieceProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const position = relativeToCanvas(site, mapWidth, mapHeight);
  const size = site.size ?? 1;
  const hasImage = Boolean(site.iconUrl);
  const showName = site.showName !== false;

  useEffect(() => {
    if (!site.iconUrl) {
      setImage(null);
      return;
    }
    const nextImage = new window.Image();
    nextImage.onload = () => setImage(nextImage);
    nextImage.onerror = () => setImage(null);
    nextImage.src = site.iconUrl;
  }, [site.iconUrl]);

  const width = hasImage ? 68 * size : 56 * size;
  const bodyHeight = hasImage ? 68 * size : 50 * size;
  const labelHeight = showName ? 24 * size : 0;
  const totalHeight = bodyHeight + labelHeight;
  const imagePadding = 4 * size;
  const imageMax = bodyHeight - imagePadding * 2;
  const imageScale = image ? Math.min(imageMax / image.naturalWidth, imageMax / image.naturalHeight) : 1;
  const imageWidth = image ? image.naturalWidth * imageScale : imageMax;
  const imageHeight = image ? image.naturalHeight * imageScale : imageMax;

  return (
    <Group
      x={position.x}
      y={position.y}
      opacity={0.94}
      draggable={!site.locked}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(event) => onDragEnd(event.target.x() / mapWidth, event.target.y() / mapHeight)}
    >
      {selected && <Rect x={-width / 2 - 6} y={-bodyHeight / 2 - 6} width={width + 12} height={totalHeight + 12} stroke="#f4d06f" strokeWidth={3} cornerRadius={8} />}
      {hasImage ? (
        <>
          <Rect x={-width / 2} y={-bodyHeight / 2} width={width} height={bodyHeight} fill="#101822" stroke={color} strokeWidth={3} cornerRadius={8} shadowBlur={8} shadowColor="#000" shadowOpacity={0.28} />
          {image && <KonvaImage image={image} x={-imageWidth / 2} y={-bodyHeight / 2 + (bodyHeight - imageHeight) / 2} width={imageWidth} height={imageHeight} />}
        </>
      ) : (
        <>
          <Rect x={-width / 2} y={-bodyHeight / 2} width={width} height={bodyHeight} fill="#101822" stroke={color} strokeWidth={3} cornerRadius={7} shadowBlur={8} shadowColor="#000" shadowOpacity={0.28} />
          <Text text="城" x={-width / 2 + 4} y={-bodyHeight / 2 + 8 * size} width={width - 8} align="center" fontSize={20 * size} fontStyle="bold" fill="#fff7e6" />
        </>
      )}
      {showName && <Text text={site.name} x={-Math.max(120, width + 36) / 2} y={bodyHeight / 2 + 5} width={Math.max(120, width + 36)} align="center" fontSize={14 * size} fill="#f5efe3" ellipsis />}
    </Group>
  );
}
