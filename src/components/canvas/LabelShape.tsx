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

function labelFont(fontSize: number) {
  return `normal ${fontSize}px ${UI_FONT_FAMILY}`;
}

function measureLabelTextWidth(text: string, fontSize: number) {
  if (typeof document === "undefined") return estimateTextWidth(text, fontSize);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return estimateTextWidth(text, fontSize);
  context.font = labelFont(fontSize);
  return context.measureText(text).width;
}

export function LabelShape({ label, selected, mapWidth, mapHeight, onSelect, onDragEnd, dragEnabled = true }: LabelShapeProps) {
  const { updateDragButton, stopBlockedDrag, isDragAllowed, resetDragButton } = usePrimaryButtonDrag();
  const position = relativeToCanvas(label, mapWidth, mapHeight);
  const horizontalPadding = 11;
  const textWidth = measureLabelTextWidth(label.text, label.fontSize);
  const width = Math.max(70, textWidth + horizontalPadding * 2);
  const height = label.fontSize + 16;
  const textAreaWidth = width - horizontalPadding * 2;
  return (
    <Group
      x={position.x}
      y={position.y}
      opacity={label.opacity}
      draggable={dragEnabled && !label.locked}
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
      {selected && <MarchingAntsRect x={-width / 2 - 5} y={-height / 2 - 5} width={width + 10} height={height + 10} cornerRadius={6} />}
      <Rect x={-width / 2} y={-height / 2} width={width} height={height} fill={label.backgroundColor} stroke={label.borderColor} strokeWidth={2} cornerRadius={6} />
      <Shape
        x={-width / 2 + horizontalPadding}
        y={-height / 2}
        width={textAreaWidth}
        height={height}
        listening={false}
        sceneFunc={(context) => {
          const canvasContext = (context as unknown as { _context: CanvasRenderingContext2D })._context;
          canvasContext.save();
          canvasContext.font = labelFont(label.fontSize);
          canvasContext.fillStyle = label.color;
          canvasContext.textAlign = "center";
          canvasContext.textBaseline = "alphabetic";
          const metrics = canvasContext.measureText(label.text);
          const ascent = metrics.actualBoundingBoxAscent || label.fontSize * 0.82;
          const descent = metrics.actualBoundingBoxDescent || label.fontSize * 0.18;
          const baselineY = height / 2 + (ascent - descent) / 2;
          canvasContext.fillText(label.text, textAreaWidth / 2, baselineY);
          canvasContext.restore();
        }}
      />
    </Group>
  );
}
