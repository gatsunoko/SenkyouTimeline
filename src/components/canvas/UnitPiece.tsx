import { useEffect, useRef, useState } from "react";
import type Konva from "konva";
import { Circle, Group, Image as KonvaImage, Line, Rect, Text } from "react-konva";
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

export function UnitPiece({ unit, frame, color, selected, mapWidth, mapHeight, onSelect, onDragEnd, onRotateEnd }: UnitPieceProps) {
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
  const isPentagon = (unit.shape ?? "rectangle") === "pentagon";
  const currentRotation = rotationPreview ?? frame.rotation ?? 0;
  const bodyRotation = isPentagon ? currentRotation : 0;

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
  const bodyHeight = hasImage ? 68 * size : 44 * size;
  const imageFramePadding = hasImage && isPentagon ? 10 * size : 0;
  const imageFrameWidth = hasImage && isPentagon ? Math.max(16, width - imageFramePadding * 2) : width;
  const imageFrameHeight = hasImage && isPentagon ? Math.max(16, bodyHeight - imageFramePadding * 2) : bodyHeight;
  const pointDepth = isPentagon ? Math.min(bodyHeight * 0.34, width * 0.22) : 0;
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
  const bodyBoundsPoints = isPentagon
    ? [
        { x: pentagonPoints[0], y: pentagonPoints[1] },
        { x: pentagonPoints[2], y: pentagonPoints[3] },
        { x: pentagonPoints[4], y: pentagonPoints[5] },
        { x: pentagonPoints[6], y: pentagonPoints[7] },
        { x: pentagonPoints[8], y: pentagonPoints[9] },
      ].map((point) => rotatedPoint(point, bodyRotation))
    : [
        { x: -width / 2, y: -bodyHeight / 2 },
        { x: width / 2, y: -bodyHeight / 2 },
        { x: width / 2, y: bodyHeight / 2 },
        { x: -width / 2, y: bodyHeight / 2 },
      ];
  const bodyBottomY = Math.max(...bodyBoundsPoints.map((point) => point.y));
  const bodySelectionSize = isPentagon ? Math.hypot(width, bodyHeight) : bodyHeight;
  const selectionWidth = isPentagon ? Math.hypot(width, bodyHeight) : width;
  const nameFontSize = unit.nameFontSize ?? 14 * size;
  const labelTextWidth = estimateTextWidth(unit.name, nameFontSize);
  const labelWidth = Math.max(24, labelTextWidth + 12);
  const labelTextWidthForKonva = labelWidth + 2;
  const labelY = bodyBottomY + 4;
  const labelBackgroundHeight = nameFontSize + 6;
  const labelTextY = labelY - 2 + (labelBackgroundHeight - nameFontSize) / 2 + nameFontSize * 0.06;
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
  const clipPentagon = (context: Konva.Context) => {
    context.beginPath();
    context.moveTo(pentagonPoints[0], pentagonPoints[1]);
    for (let index = 2; index < pentagonPoints.length; index += 2) {
      context.lineTo(pentagonPoints[index], pentagonPoints[index + 1]);
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
      {selected && <MarchingAntsRect x={-selectionWidth / 2 - 6} y={-bodySelectionSize / 2 - 6} width={selectionWidth + 12} height={totalHeight + 12} cornerRadius={8} />}
      {selected && isPentagon && !unit.locked && (
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
          {isPentagon ? (
            <>
              <Group rotation={bodyRotation}>
                <Line points={pentagonPoints} fill={color} closed shadowBlur={8} shadowColor="#000" shadowOpacity={0.35} />
              </Group>
              <Group rotation={bodyRotation} clipFunc={clipPentagon}>
                <Group rotation={-bodyRotation}>
                  <Rect x={-imageFrameWidth / 2} y={imageFrameY - imageFrameHeight / 2} width={imageFrameWidth} height={imageFrameHeight} fill={color} listening={false} />
                  {image && <KonvaImage image={image} x={-imageWidth / 2} y={imageFrameY - imageHeight / 2} width={imageWidth} height={imageHeight} />}
                </Group>
              </Group>
              <Group rotation={bodyRotation}>
                <Line points={pentagonPoints} stroke={color} strokeWidth={3} closed shadowBlur={8} shadowColor="#000" shadowOpacity={0.35} />
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
          {isPentagon ? (
            <Line points={pentagonPoints} fill={color} stroke="#1b1f29" strokeWidth={2} closed shadowBlur={8} shadowColor="#000" shadowOpacity={0.35} />
          ) : (
            <Rect x={-width / 2} y={-bodyHeight / 2} width={width} height={bodyHeight} fill={color} stroke="#1b1f29" strokeWidth={2} cornerRadius={8} shadowBlur={8} shadowColor="#000" shadowOpacity={0.35} />
          )}
        </Group>
      )}
      {showName && unit.nameBackgroundEnabled && <Rect x={-labelWidth / 2} y={labelY - 2} width={labelWidth} height={labelBackgroundHeight} fill={unit.nameBackgroundColor ?? "#111827"} cornerRadius={5} opacity={0.92} />}
      {showName && <Text text={unit.name} x={-labelTextWidthForKonva / 2} y={labelTextY} width={labelTextWidthForKonva} height={nameFontSize + 2} align="center" fontSize={nameFontSize} fontStyle="bold" fill={nameTextColor} wrap="none" />}
    </Group>
  );
}
