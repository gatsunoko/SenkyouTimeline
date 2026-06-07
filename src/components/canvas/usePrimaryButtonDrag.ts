import { useCallback, useRef } from "react";
import type Konva from "konva";

function isPrimaryMouseButton(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
  return !("button" in event.evt) || event.evt.button === 0;
}

export function usePrimaryButtonDrag() {
  const primaryDragRef = useRef(true);

  const updateDragButton = useCallback((event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    primaryDragRef.current = isPrimaryMouseButton(event);
  }, []);

  const stopBlockedDrag = useCallback((event: Konva.KonvaEventObject<Event>) => {
    if (!primaryDragRef.current) event.target.stopDrag();
  }, []);

  const isDragAllowed = useCallback(() => primaryDragRef.current, []);

  const resetDragButton = useCallback(() => {
    primaryDragRef.current = true;
  }, []);

  return { updateDragButton, stopBlockedDrag, isDragAllowed, resetDragButton };
}
