import { useEffect, useState } from "react";
import { Group, Image as KonvaImage, Rect, Text } from "react-konva";
import type { Unit } from "../../types/project";
import type { ResolvedUnitFrame } from "../../utils/interpolation";
import { relativeToCanvas } from "../../utils/coordinate";
import { usePrimaryButtonDrag } from "./usePrimaryButtonDrag";

interface UnitPieceProps {
  unit: Unit;
  frame: ResolvedUnitFrame;
  color: string;
  selected: boolean;
  mapWidth: number;
  mapHeight: number;
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

export function UnitPiece({ unit, frame, color, selected, mapWidth, mapHeight, onSelect, onDragEnd }: UnitPieceProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const { updateDragButton, stopBlockedDrag, isDragAllowed, resetDragButton } = usePrimaryButtonDrag();
  const position = relativeToCanvas(frame, mapWidth, mapHeight);
  const hasImage = Boolean(unit.iconUrl);
  const showName = unit.showName !== false;
  const textColor = readableTextColor(color);
  const size = frame.size ?? unit.size;

  useEffect(() => {
    if (!unit.iconUrl) {
      setImage(null);
      return;
    }
    const nextImage = new window.Image();
    nextImage.onload = () => setImage(nextImage);
    nextImage.onerror = () => setImage(null);
    nextImage.src = unit.iconUrl;
  }, [unit.iconUrl]);

  const width = hasImage ? 68 * size : 92 * size;
  const bodyHeight = hasImage ? 68 * size : 44 * size;
  const labelHeight = hasImage && showName ? 22 * size : 0;
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
      draggable={!unit.locked}
      opacity={0.96}
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
          <Rect x={-width / 2} y={-bodyHeight / 2} width={width} height={bodyHeight} fill="#101822" stroke={color} strokeWidth={3} cornerRadius={8} shadowBlur={8} shadowColor="#000" shadowOpacity={0.35} />
          {image && <KonvaImage image={image} x={-imageWidth / 2} y={-bodyHeight / 2 + (bodyHeight - imageHeight) / 2} width={imageWidth} height={imageHeight} />}
          {showName && <Text text={unit.name} x={-width / 2 - 18} y={bodyHeight / 2 + 4} width={width + 36} align="center" fontSize={14 * size} fontStyle="bold" fill="#f5efe3" ellipsis />}
        </>
      ) : (
        <>
          <Rect x={-width / 2} y={-bodyHeight / 2} width={width} height={bodyHeight} fill={color} stroke="#1b1f29" strokeWidth={2} cornerRadius={8} shadowBlur={8} shadowColor="#000" shadowOpacity={0.35} />
          <Text text={unit.name} x={-width / 2 + 8} y={-bodyHeight / 2 + 11} width={width - 16} align="center" fontSize={17 * size} fontStyle="bold" fill={textColor} ellipsis />
        </>
      )}
    </Group>
  );
}
