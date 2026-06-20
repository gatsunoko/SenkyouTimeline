import { Group, Rect, Shape } from "react-konva";
import { UI_FONT_FAMILY } from "../../constants/fonts";
import type { MapLabel } from "../../types/project";
import { relativeToCanvas } from "../../utils/coordinate";
import { MarchingAntsRect } from "./SelectionMarchingAnts";
import { usePrimaryButtonDrag } from "./usePrimaryButtonDrag";

interface LabelShapeProps {
  label: MapLabel;
  selected: boolean;
  mapWidth: number;
  mapHeight: number;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
  dragEnabled?: boolean;
}

function estimateTextWidth(text: string, fontSize: number) {
  return Array.from(text).reduce((sum, char) => {
    const wide = /[^\u0020-\u007e]/.test(char);
    return sum + fontSize * (wide ? 1.05 : 0.62);
  }, 0);
}

function labelFont(fontSize: number, bold = false) {
  return `${bold ? "bold" : "normal"} ${fontSize}px ${UI_FONT_FAMILY}`;
}

function measureLabelTextWidth(text: string, fontSize: number, bold = false) {
  if (typeof document === "undefined") return estimateTextWidth(text, fontSize);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return estimateTextWidth(text, fontSize);
  context.font = labelFont(fontSize, bold);
  return context.measureText(text).width;
}

function resolvedBorderWidth(value: number | undefined, fallback = 2) {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : fallback;
}

export function LabelShape({ label, selected, mapWidth, mapHeight, onSelect, onDragEnd, dragEnabled = true }: LabelShapeProps) {
  const { updateDragButton, stopBlockedDrag, isDragAllowed, resetDragButton } = usePrimaryButtonDrag();
  const position = relativeToCanvas(label, mapWidth, mapHeight);
  const horizontalPadding = 11;
  const labelBold = label.bold ?? false;
  const borderEnabled = label.borderEnabled ?? true;
  const borderWidth = borderEnabled ? resolvedBorderWidth(label.borderWidth, 2) : 0;
  const outerBorderEnabled = borderEnabled && (label.outerBorderEnabled ?? false);
  const outerBorderWidth = outerBorderEnabled ? resolvedBorderWidth(label.outerBorderWidth, 2) : 0;
  const outerBorderColor = label.outerBorderColor ?? "#111827";
  const outerBorderOffset = borderWidth / 2 + outerBorderWidth / 2;
  const selectionMargin = 5 + borderWidth / 2 + outerBorderWidth;
  const backgroundEnabled = label.backgroundEnabled ?? true;
  const outlineEnabled = label.outlineEnabled ?? false;
  const outlineColor = label.outlineColor ?? "#111827";
  const outlineWidth = outlineEnabled ? Math.max(2, label.fontSize * 0.12) : 0;
  const textWidth = measureLabelTextWidth(label.text, label.fontSize, labelBold);
  const width = Math.max(70, textWidth + horizontalPadding * 2 + outlineWidth * 2);
  const height = label.fontSize + 16;
  const textAreaWidth = width - horizontalPadding * 2;
  const interactive = !label.locked;
  return (
    <Group
      x={position.x}
      y={position.y}
      opacity={label.opacity}
      listening={interactive}
      draggable={dragEnabled && interactive}
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
      {selected && <MarchingAntsRect x={-width / 2 - selectionMargin} y={-height / 2 - selectionMargin} width={width + selectionMargin * 2} height={height + selectionMargin * 2} cornerRadius={6 + selectionMargin} />}
      {outerBorderEnabled && outerBorderWidth > 0 && (
        <Rect
          x={-width / 2 - outerBorderOffset}
          y={-height / 2 - outerBorderOffset}
          width={width + outerBorderOffset * 2}
          height={height + outerBorderOffset * 2}
          stroke={outerBorderColor}
          strokeWidth={outerBorderWidth}
          cornerRadius={6 + outerBorderOffset}
        />
      )}
      <Rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        fill={backgroundEnabled ? label.backgroundColor : undefined}
        stroke={borderEnabled && borderWidth > 0 ? label.borderColor : undefined}
        strokeWidth={borderEnabled ? borderWidth : 0}
        cornerRadius={6}
      />
      <Shape
        x={-width / 2 + horizontalPadding}
        y={-height / 2}
        width={textAreaWidth}
        height={height}
        listening={false}
        sceneFunc={(context) => {
          const canvasContext = (context as unknown as { _context: CanvasRenderingContext2D })._context;
          canvasContext.save();
          canvasContext.font = labelFont(label.fontSize, labelBold);
          canvasContext.fillStyle = label.color;
          canvasContext.textAlign = "center";
          canvasContext.textBaseline = "alphabetic";
          const metrics = canvasContext.measureText(label.text);
          const ascent = metrics.actualBoundingBoxAscent || label.fontSize * 0.82;
          const descent = metrics.actualBoundingBoxDescent || label.fontSize * 0.18;
          const baselineY = height / 2 + (ascent - descent) / 2;
          if (outlineEnabled) {
            canvasContext.strokeStyle = outlineColor;
            canvasContext.lineWidth = outlineWidth;
            canvasContext.lineJoin = "round";
            canvasContext.strokeText(label.text, textAreaWidth / 2, baselineY);
          }
          canvasContext.fillText(label.text, textAreaWidth / 2, baselineY);
          canvasContext.restore();
        }}
      />
    </Group>
  );
}
