import { useEffect, useState } from "react";
import { Group, Image as KonvaImage, Rect } from "react-konva";
import type { PlacedImage, PlacedImageKeyframe } from "../../types/project";
import { relativeToCanvas } from "../../utils/coordinate";
import { getCachedImage, loadCachedImage } from "../../utils/imageCache";
import { MarchingAntsRect } from "./SelectionMarchingAnts";
import { usePrimaryButtonDrag } from "./usePrimaryButtonDrag";

interface PlacedImageShapeProps {
  imageObject: PlacedImage;
  frame: PlacedImageKeyframe;
  selected: boolean;
  mapWidth: number;
  mapHeight: number;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
  dragEnabled?: boolean;
}

export function placedImageSize(imageObject: Pick<PlacedImage, "naturalWidth" | "naturalHeight" | "size">) {
  const naturalWidth = imageObject.naturalWidth && imageObject.naturalWidth > 0 ? imageObject.naturalWidth : 96;
  const naturalHeight = imageObject.naturalHeight && imageObject.naturalHeight > 0 ? imageObject.naturalHeight : 96;
  const baseWidth = 96 * (imageObject.size ?? 1);
  return {
    width: baseWidth,
    height: baseWidth * (naturalHeight / naturalWidth),
  };
}

export function PlacedImageShape({ imageObject, frame, selected, mapWidth, mapHeight, onSelect, onDragEnd, dragEnabled = true }: PlacedImageShapeProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(() => getCachedImage(imageObject.imageDataUrl));
  const { updateDragButton, stopBlockedDrag, isDragAllowed, resetDragButton } = usePrimaryButtonDrag();
  const position = relativeToCanvas(frame, mapWidth, mapHeight);
  const size = placedImageSize(imageObject);

  useEffect(() => {
    const cached = getCachedImage(imageObject.imageDataUrl);
    if (cached) {
      setImage(cached);
      return;
    }
    let cancelled = false;
    loadCachedImage(imageObject.imageDataUrl)
      .then((nextImage) => {
        if (!cancelled) setImage(nextImage);
      })
      .catch(() => {
        if (!cancelled) setImage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [imageObject.imageDataUrl]);

  return (
    <Group
      x={position.x}
      y={position.y}
      listening={!imageObject.locked}
      draggable={dragEnabled && !imageObject.locked}
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
      {image ? (
        <KonvaImage image={image} x={-size.width / 2} y={-size.height / 2} width={size.width} height={size.height} />
      ) : (
        <Rect x={-size.width / 2} y={-size.height / 2} width={size.width} height={size.height} fill="#263341" stroke="#82a7d9" strokeWidth={2} />
      )}
      {selected && <MarchingAntsRect x={-size.width / 2 - 6} y={-size.height / 2 - 6} width={size.width + 12} height={size.height + 12} cornerRadius={4} />}
    </Group>
  );
}
