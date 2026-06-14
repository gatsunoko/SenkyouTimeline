import { useEffect, useRef, useState } from "react";
import type Konva from "konva";
import { Circle, Group, Image as KonvaImage, Line, Rect, Text } from "react-konva";
import { UI_FONT_FAMILY } from "../../constants/fonts";
import type { Unit } from "../../types/project";
import type { ResolvedUnitFrame } from "../../utils/interpolation";
import { relativeToCanvas } from "../../utils/coordinate";
import { getCachedImage, loadCachedImage } from "../../utils/imageCache";
import { MarchingAntsCircle, MarchingAntsLine, MarchingAntsRect } from "./SelectionMarchingAnts";
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
  onRotateEnd: (rotation: number) => void;
  dragEnabled?: boolean;
}

type RotationDragState = {
  previousPointerAngle: number;
  previewRotation: number;
};

function estimateTextWidth(text: string, fontSize: number) {
  return Array.from(text).reduce((sum, char) => {
    const wide = /[^\u0020-\u007e]/.test(char);
    return sum + fontSize * (wide ? 1.02 : 0.58);
  }, 0);
}

function pointerAngleFromCenter(pointer: { x: number; y: number }) {
  return (Math.atan2(pointer.x, -pointer.y) * 180) / Math.PI;
}

function shortestAngleDelta(from: number, to: number) {
  return ((to - from + 540) % 360) - 180;
}

function rotatedPoint(point: { x: number; y: number }, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

function polygonPointsToCanvasPoints(points: number[]) {
  const result: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < points.length - 1; index += 2) {
    result.push({ x: points[index], y: points[index + 1] });
  }
  return result;
}

function rectanglePoints(width: number, height: number) {
  return [
    { x: -width / 2, y: -height / 2 },
    { x: width / 2, y: -height / 2 },
    { x: width / 2, y: height / 2 },
    { x: -width / 2, y: height / 2 },
  ];
}

export function UnitPiece({ unit, frame, color, selected, mapWidth, mapHeight, onSelect, onDragEnd, onRotateEnd, dragEnabled = true }: UnitPieceProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(() => getCachedImage(unit.iconUrl));
  const [rotationPreview, setRotationPreview] = useState<number | null>(null);
  const [rotationHandlePreview, setRotationHandlePreview] = useState<{ x: number; y: number } | null>(null);
  const rootGroupRef = useRef<Konva.Group>(null);
  const rotationDragRef = useRef<RotationDragState | null>(null);
  const { updateDragButton, stopBlockedDrag, isDragAllowed, resetDragButton } = usePrimaryButtonDrag();
  const position = relativeToCanvas(frame, mapWidth, mapHeight);
  const hasImage = Boolean(unit.iconUrl);
  const showName = unit.showName !== false;
  const size = frame.size ?? unit.size;
  const nameTextColor = unit.nameTextColor ?? "#f5efe3";
  const nameFontStyle = unit.nameBold ?? true ? "bold" : "normal";
  const nameOutlineEnabled = unit.nameOutlineEnabled ?? false;
  const nameOutlineColor = unit.nameOutlineColor ?? "#111827";
  const shape = unit.shape ?? "pentagon";
  const isPentagon = shape === "pentagon";
  const isConvex = shape === "convex";
  const isDirectionalShape = isPentagon || isConvex;
  const interactive = !unit.locked;
  const currentRotation = rotationPreview ?? frame.rotation ?? 0;
  const bodyRotation = isDirectionalShape ? currentRotation : 0;

  useEffect(() => {
    if (!unit.iconUrl) {
      setImage(null);
      return;
    }
    const cached = getCachedImage(unit.iconUrl);
    if (cached) {
      setImage(cached);
      return;
    }
    let cancelled = false;
    loadCachedImage(unit.iconUrl)
      .then((nextImage) => {
        if (!cancelled) setImage(nextImage);
      })
      .catch(() => {
        if (!cancelled) setImage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [unit.iconUrl]);

  const width = hasImage ? 68 * size : 92 * size;
  const baseBodyHeight = hasImage ? 68 * size : 44 * size;
  const bodyHeight = isConvex ? (width / 3) * 2 : baseBodyHeight;
  const imageFramePadding = hasImage && isDirectionalShape ? 10 * size : 0;
  const imageFrameWidth = hasImage && isDirectionalShape ? Math.max(16, width - imageFramePadding * 2) : width;
  const imageFrameHeight = hasImage && isDirectionalShape ? Math.max(16, bodyHeight - imageFramePadding * 2) : bodyHeight;
  const pointDepth = isPentagon ? Math.min(bodyHeight * 0.34, width * 0.22) : 0;
  const convexShoulderDepth = isConvex ? bodyHeight / 2 : 0;
  const convexNeckHalfWidth = width / 6;
  const imageFrameY = hasImage && isPentagon ? pointDepth * 0.35 : 0;
  const pentagonPoints = [
    0,
    -bodyHeight / 2,
    width / 2,
    -bodyHeight / 2 + pointDepth,
    width / 2,
    bodyHeight / 2,
    -width / 2,
    bodyHeight / 2,
    -width / 2,
    -bodyHeight / 2 + pointDepth,
  ];
  const convexPoints = [
    -width / 2,
    -bodyHeight / 2 + convexShoulderDepth,
    -convexNeckHalfWidth,
    -bodyHeight / 2 + convexShoulderDepth,
    -convexNeckHalfWidth,
    -bodyHeight / 2,
    convexNeckHalfWidth,
    -bodyHeight / 2,
    convexNeckHalfWidth,
    -bodyHeight / 2 + convexShoulderDepth,
    width / 2,
    -bodyHeight / 2 + convexShoulderDepth,
    width / 2,
    bodyHeight / 2,
    -width / 2,
    bodyHeight / 2,
  ];
  const polygonPoints = isPentagon ? pentagonPoints : isConvex ? convexPoints : [];
  const bodyBoundsPoints = isDirectionalShape
    ? polygonPointsToCanvasPoints(polygonPoints).map((point) => rotatedPoint(point, bodyRotation))
    : rectanglePoints(width, bodyHeight);
  const bodyBottomY = Math.max(...bodyBoundsPoints.map((point) => point.y));
  const bodySelectionSize = isDirectionalShape ? Math.hypot(width, bodyHeight) : bodyHeight;
  const selectionWidth = isDirectionalShape ? Math.hypot(width, bodyHeight) : width;
  const nameFontSize = unit.nameFontSize ?? 14 * size;
  const nameOutlineWidth = nameOutlineEnabled ? Math.max(2, nameFontSize * 0.12) : 0;
  const labelTextWidth = estimateTextWidth(unit.name, nameFontSize);
  const labelWidth = Math.max(24, labelTextWidth + 12 + nameOutlineWidth * 2);
  const labelTextWidthForKonva = labelWidth + 2;
  const labelY = bodyBottomY + 4;
  const labelBackgroundHeight = nameFontSize + 6 + nameOutlineWidth * 2;
  const labelTextY = labelY - 2 + (labelBackgroundHeight - nameFontSize) / 2 + nameFontSize * 0.06 - nameOutlineWidth;
  const labelHeight = showName ? labelBackgroundHeight + 2 : 0;
  const totalHeight = bodySelectionSize + labelHeight;
  const rotateGuideRadius = bodySelectionSize / 2 + 18;
  const rotationHandleRestPosition = {
    x: Math.sin((currentRotation * Math.PI) / 180) * rotateGuideRadius,
    y: -Math.cos((currentRotation * Math.PI) / 180) * rotateGuideRadius,
  };
  const rotationHandlePosition = rotationHandlePreview ?? rotationHandleRestPosition;
  const imageScale = image ? Math.min(imageFrameWidth / image.naturalWidth, imageFrameHeight / image.naturalHeight) : 1;
  const imageWidth = image ? image.naturalWidth * imageScale : imageFrameWidth;
  const imageHeight = image ? image.naturalHeight * imageScale : imageFrameHeight;
  const clipPolygon = (context: Konva.Context) => {
    context.beginPath();
    context.moveTo(polygonPoints[0], polygonPoints[1]);
    for (let index = 2; index < polygonPoints.length; index += 2) {
      context.lineTo(polygonPoints[index], polygonPoints[index + 1]);
    }
    context.closePath();
  };
  const localPointerPosition = (stage: Konva.Stage | null) => {
    const pointer = stage?.getPointerPosition();
    const group = rootGroupRef.current;
    if (!pointer || !group) return null;
    return group.getAbsoluteTransform().copy().invert().point(pointer);
  };
  const updateRotationPreviewFromPointer = (stage: Konva.Stage | null) => {
    const drag = rotationDragRef.current;
    const pointer = localPointerPosition(stage);
    if (!drag || !pointer) return drag?.previewRotation ?? currentRotation;

    const pointerAngle = pointerAngleFromCenter(pointer);
    const nextRotation = drag.previewRotation + shortestAngleDelta(drag.previousPointerAngle, pointerAngle);
    rotationDragRef.current = {
      previousPointerAngle: pointerAngle,
      previewRotation: nextRotation,
    };
    setRotationHandlePreview(pointer);
    setRotationPreview(nextRotation);
    return nextRotation;
  };

  return (
    <Group
      ref={rootGroupRef}
      x={position.x}
      y={position.y}
      listening={interactive}
      draggable={dragEnabled && interactive}
      opacity={hasImage ? 1 : 0.96}
      onClick={interactive ? onSelect : undefined}
      onTap={interactive ? onSelect : undefined}
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
      {selected && <MarchingAntsRect x={-selectionWidth / 2 - 6} y={-bodySelectionSize / 2 - 6} width={selectionWidth + 12} height={totalHeight + 12} cornerRadius={8} />}
      {selected && isDirectionalShape && dragEnabled && interactive && (
        <>
          <MarchingAntsCircle radius={rotateGuideRadius} opacity={0.72} />
          <MarchingAntsLine points={[0, 0, rotationHandlePosition.x, rotationHandlePosition.y]} strokeWidth={2} />
          <Circle
            x={rotationHandlePosition.x}
            y={rotationHandlePosition.y}
            radius={8}
            fill="#f4d06f"
            stroke="#1b1f29"
            strokeWidth={2}
            listening={false}
          />
          <Circle
            x={rotationHandlePosition.x}
            y={rotationHandlePosition.y}
            radius={18}
            fill="rgba(244, 208, 111, 0.01)"
            draggable
            onMouseDown={(event) => {
              event.cancelBubble = true;
              onSelect();
            }}
            onTap={(event) => {
              event.cancelBubble = true;
              onSelect();
            }}
            onDragStart={(event) => {
              event.cancelBubble = true;
              const pointer = localPointerPosition(event.target.getStage());
              rotationDragRef.current = {
                previousPointerAngle: pointer ? pointerAngleFromCenter(pointer) : currentRotation,
                previewRotation: currentRotation,
              };
              if (pointer) setRotationHandlePreview(pointer);
            }}
            onDragMove={(event) => {
              event.cancelBubble = true;
              updateRotationPreviewFromPointer(event.target.getStage());
            }}
            onDragEnd={(event) => {
              event.cancelBubble = true;
              const nextRotation = updateRotationPreviewFromPointer(event.target.getStage());
              rotationDragRef.current = null;
              setRotationHandlePreview(null);
              setRotationPreview(null);
              onRotateEnd(nextRotation);
            }}
          />
        </>
      )}
      {hasImage ? (
        <>
          {isDirectionalShape ? (
            <>
              <Group rotation={bodyRotation}>
                <Line points={polygonPoints} fill={color} closed shadowBlur={8} shadowColor="#000" shadowOpacity={0.35} />
              </Group>
              <Group rotation={bodyRotation} clipFunc={clipPolygon}>
                <Group rotation={-bodyRotation}>
                  <Rect x={-imageFrameWidth / 2} y={imageFrameY - imageFrameHeight / 2} width={imageFrameWidth} height={imageFrameHeight} fill={color} listening={false} />
                  {image && <KonvaImage image={image} x={-imageWidth / 2} y={imageFrameY - imageHeight / 2} width={imageWidth} height={imageHeight} />}
                </Group>
              </Group>
              <Group rotation={bodyRotation}>
                <Line points={polygonPoints} stroke={color} strokeWidth={3} closed shadowBlur={8} shadowColor="#000" shadowOpacity={0.35} />
              </Group>
            </>
          ) : (
            <>
              <Group
                clipFunc={(context) => {
                  context.beginPath();
                  context.roundRect(-imageFrameWidth / 2, imageFrameY - imageFrameHeight / 2, imageFrameWidth, imageFrameHeight, 8);
                }}
              >
                <Rect x={-imageFrameWidth / 2} y={imageFrameY - imageFrameHeight / 2} width={imageFrameWidth} height={imageFrameHeight} fill={color} listening={false} />
                {image && <KonvaImage image={image} x={-imageWidth / 2} y={imageFrameY - imageHeight / 2} width={imageWidth} height={imageHeight} />}
              </Group>
              <Rect x={-width / 2} y={-bodyHeight / 2} width={width} height={bodyHeight} stroke={color} strokeWidth={3} cornerRadius={8} shadowBlur={8} shadowColor="#000" shadowOpacity={0.35} />
            </>
          )}
        </>
      ) : (
        <Group rotation={bodyRotation}>
          {isDirectionalShape ? (
            <Line points={polygonPoints} fill={color} stroke="#1b1f29" strokeWidth={2} closed shadowBlur={8} shadowColor="#000" shadowOpacity={0.35} />
          ) : (
            <Rect x={-width / 2} y={-bodyHeight / 2} width={width} height={bodyHeight} fill={color} stroke="#1b1f29" strokeWidth={2} cornerRadius={8} shadowBlur={8} shadowColor="#000" shadowOpacity={0.35} />
          )}
        </Group>
      )}
      {showName && unit.nameBackgroundEnabled && <Rect x={-labelWidth / 2} y={labelY - 2} width={labelWidth} height={labelBackgroundHeight} fill={unit.nameBackgroundColor ?? "#111827"} cornerRadius={5} opacity={0.92} />}
      {showName && nameOutlineEnabled && <Text text={unit.name} x={-labelTextWidthForKonva / 2} y={labelTextY} width={labelTextWidthForKonva} height={nameFontSize + 2} align="center" fontSize={nameFontSize} fontFamily={UI_FONT_FAMILY} fontStyle={nameFontStyle} fill={nameOutlineColor} stroke={nameOutlineColor} strokeWidth={nameOutlineWidth} wrap="none" listening={false} />}
      {showName && <Text text={unit.name} x={-labelTextWidthForKonva / 2} y={labelTextY} width={labelTextWidthForKonva} height={nameFontSize + 2} align="center" fontSize={nameFontSize} fontFamily={UI_FONT_FAMILY} fontStyle={nameFontStyle} fill={nameTextColor} wrap="none" />}
    </Group>
  );
}
