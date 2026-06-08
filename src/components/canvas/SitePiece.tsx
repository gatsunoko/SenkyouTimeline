import { useEffect, useState } from "react";
import { Group, Image as KonvaImage, Rect, Text } from "react-konva";
import type { Site } from "../../types/project";
import { relativeToCanvas } from "../../utils/coordinate";
import { usePrimaryButtonDrag } from "./usePrimaryButtonDrag";

interface SitePieceProps {
  site: Site;
  selected: boolean;
  color: string;
  mapWidth: number;
  mapHeight: number;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
}

function estimateTextWidth(text: string, fontSize: number) {
  return Array.from(text).reduce((sum, char) => {
    const wide = /[^\u0020-\u007e]/.test(char);
    return sum + fontSize * (wide ? 1.02 : 0.58);
  }, 0);
}

export function SitePiece({ site, selected, color, mapWidth, mapHeight, onSelect, onDragEnd }: SitePieceProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const { updateDragButton, stopBlockedDrag, isDragAllowed, resetDragButton } = usePrimaryButtonDrag();
  const position = relativeToCanvas(site, mapWidth, mapHeight);
  const size = site.size ?? 1;
  const nameFontSize = site.nameFontSize ?? 14 * size;
  const hasImage = Boolean(site.iconUrl);
  const showName = site.showName !== false;
  const nameTextColor = site.nameTextColor ?? "#f5efe3";

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
  const labelTextWidth = estimateTextWidth(site.name, nameFontSize);
  const labelWidth = Math.max(24, labelTextWidth + 12);
  const labelTextWidthForKonva = labelWidth + 2;
  const labelY = bodyHeight / 2 + 5;
  const labelBackgroundHeight = nameFontSize + 6;
  const labelTextY = labelY - 2 + (labelBackgroundHeight - nameFontSize) / 2 + nameFontSize * 0.06;
  const labelHeight = showName ? labelBackgroundHeight + 2 : 0;
  const totalHeight = bodyHeight + labelHeight;
  const imageScale = image ? Math.max(width / image.naturalWidth, bodyHeight / image.naturalHeight) : 1;
  const imageWidth = image ? image.naturalWidth * imageScale : width;
  const imageHeight = image ? image.naturalHeight * imageScale : bodyHeight;

  return (
    <Group
      x={position.x}
      y={position.y}
      opacity={hasImage ? 1 : 0.94}
      draggable={!site.locked}
      onClick={onSelect}
      onTap={onSelect}
      onMouseDown={updateDragButton}
      onDragStart={stopBlockedDrag}
      dragBoundFunc={(nextPosition) => (isDragAllowed() ? nextPosition : position)}
      onDragEnd={(event) => {
        if (!isDragAllowed()) {
          event.target.position(position);
          resetDragButton();
          return;
        }
        resetDragButton();
        onDragEnd(event.target.x() / mapWidth, event.target.y() / mapHeight);
      }}
    >
      {selected && <Rect x={-width / 2 - 6} y={-bodyHeight / 2 - 6} width={width + 12} height={totalHeight + 12} stroke="#f4d06f" strokeWidth={3} cornerRadius={8} />}
      {hasImage ? (
        <>
          <Group
            clipFunc={(context) => {
              context.beginPath();
              context.roundRect(-width / 2, -bodyHeight / 2, width, bodyHeight, 8);
            }}
          >
            <Rect x={-width / 2} y={-bodyHeight / 2} width={width} height={bodyHeight} fill={color} listening={false} />
            {image && <KonvaImage image={image} x={-imageWidth / 2} y={-imageHeight / 2} width={imageWidth} height={imageHeight} />}
          </Group>
          <Rect x={-width / 2} y={-bodyHeight / 2} width={width} height={bodyHeight} stroke={color} strokeWidth={3} cornerRadius={8} shadowBlur={8} shadowColor="#000" shadowOpacity={0.28} />
        </>
      ) : (
        <>
          <Rect x={-width / 2} y={-bodyHeight / 2} width={width} height={bodyHeight} fill="#101822" stroke={color} strokeWidth={3} cornerRadius={7} shadowBlur={8} shadowColor="#000" shadowOpacity={0.28} />
          <Text text="城" x={-width / 2 + 4} y={-bodyHeight / 2 + 8 * size} width={width - 8} align="center" fontSize={20 * size} fontStyle="bold" fill="#fff7e6" />
        </>
      )}
      {showName && site.nameBackgroundEnabled && <Rect x={-labelWidth / 2} y={labelY - 2} width={labelWidth} height={labelBackgroundHeight} fill={site.nameBackgroundColor ?? "#111827"} cornerRadius={5} opacity={0.92} />}
      {showName && <Text text={site.name} x={-labelTextWidthForKonva / 2} y={labelTextY} width={labelTextWidthForKonva} height={nameFontSize + 2} align="center" fontSize={nameFontSize} fill={nameTextColor} wrap="none" ellipsis />}
    </Group>
  );
}
