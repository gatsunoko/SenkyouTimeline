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

function estimateTextWidth(text: string, fontSize: number) {
  return Array.from(text).reduce((sum, char) => {
    const wide = /[^\u0020-\u007e]/.test(char);
    return sum + fontSize * (wide ? 1.02 : 0.58);
  }, 0);
}

export function UnitPiece({ unit, frame, color, selected, mapWidth, mapHeight, onSelect, onDragEnd }: UnitPieceProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const { updateDragButton, stopBlockedDrag, isDragAllowed, resetDragButton } = usePrimaryButtonDrag();
  const position = relativeToCanvas(frame, mapWidth, mapHeight);
  const hasImage = Boolean(unit.iconUrl);
  const showName = unit.showName !== false;
  const textColor = readableTextColor(color);
  const size = frame.size ?? unit.size;
  const nameTextColor = unit.nameTextColor ?? "#f5efe3";

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
  const nameFontSize = 14 * size;
  const labelTextWidth = estimateTextWidth(unit.name, nameFontSize);
  const labelWidth = Math.max(24, labelTextWidth + 12);
  const labelTextWidthForKonva = labelWidth + 2;
  const labelY = bodyHeight / 2 + 4;
  const labelBackgroundHeight = nameFontSize + 6;
  const labelHeight = hasImage && showName ? labelBackgroundHeight + 2 : 0;
  const bodyNameFontSize = 17 * size;
  const bodyNameWidth = Math.min(width - 12, Math.max(24, estimateTextWidth(unit.name, bodyNameFontSize) + 12));
  const totalHeight = bodyHeight + labelHeight;
  const imageScale = image ? Math.max(width / image.naturalWidth, bodyHeight / image.naturalHeight) : 1;
  const imageWidth = image ? image.naturalWidth * imageScale : width;
  const imageHeight = image ? image.naturalHeight * imageScale : bodyHeight;

  return (
    <Group
      x={position.x}
      y={position.y}
      draggable={!unit.locked}
      opacity={hasImage ? 1 : 0.96}
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
          <Rect x={-width / 2} y={-bodyHeight / 2} width={width} height={bodyHeight} stroke={color} strokeWidth={3} cornerRadius={8} shadowBlur={8} shadowColor="#000" shadowOpacity={0.35} />
          {showName && unit.nameBackgroundEnabled && <Rect x={-labelWidth / 2} y={labelY - 2} width={labelWidth} height={labelBackgroundHeight} fill={unit.nameBackgroundColor ?? "#111827"} cornerRadius={5} opacity={0.92} />}
          {showName && <Text text={unit.name} x={-labelTextWidthForKonva / 2} y={labelY} width={labelTextWidthForKonva} align="center" fontSize={nameFontSize} fontStyle="bold" fill={nameTextColor} wrap="none" ellipsis />}
        </>
      ) : (
        <>
          <Rect x={-width / 2} y={-bodyHeight / 2} width={width} height={bodyHeight} fill={color} stroke="#1b1f29" strokeWidth={2} cornerRadius={8} shadowBlur={8} shadowColor="#000" shadowOpacity={0.35} />
          {unit.nameBackgroundEnabled && <Rect x={-bodyNameWidth / 2} y={-bodyHeight / 2 + 8} width={bodyNameWidth} height={bodyNameFontSize + 6} fill={unit.nameBackgroundColor ?? "#111827"} cornerRadius={5} opacity={0.92} />}
          <Text text={unit.name} x={-width / 2 + 8} y={-bodyHeight / 2 + 11} width={width - 16} align="center" fontSize={17 * size} fontStyle="bold" fill={unit.nameTextColor ?? textColor} ellipsis />
        </>
      )}
    </Group>
  );
}
