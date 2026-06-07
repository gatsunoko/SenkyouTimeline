import { useEffect, useState } from "react";
import { PanelLeftOpen } from "lucide-react";
import { MapCanvas } from "../canvas/MapCanvas";
import { LeftSidebar } from "./LeftSidebar";
import { RightInspector } from "./RightInspector";
import { TimelinePanel } from "./TimelinePanel";
import { Toolbar } from "./Toolbar";
import { useProjectStore } from "../../store/projectStore";
import { downloadJson } from "../../utils/fileIO";

export function AppShell() {
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const exportProject = useProjectStore((state) => state.exportProject);
  const selected = useProjectStore((state) => state.selected);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const deleteSelected = useProjectStore((state) => state.deleteSelected);
  const cancelDrawing = useProjectStore((state) => state.cancelDrawing);
  const finishDrawing = useProjectStore((state) => state.finishDrawing);
  const moveFrame = useProjectStore((state) => state.moveFrame);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT";
      if (editing && !(event.ctrlKey && ["s", "z", "y"].includes(event.key.toLowerCase()))) return;

      if (event.ctrlKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        downloadJson(exportProject(), "sengoku-battle-map-project.json");
      } else if (event.ctrlKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      } else if (event.ctrlKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      } else if (event.key === "Delete") {
        event.preventDefault();
        deleteSelected();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancelDrawing();
      } else if (event.key === "Enter") {
        event.preventDefault();
        finishDrawing();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveFrame(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        moveFrame(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelDrawing, deleteSelected, exportProject, finishDrawing, moveFrame, redo, undo]);

  return (
    <div className="app-shell">
      <Toolbar />
      <div className={`main-grid ${selected.type && selected.id ? "" : "is-inspector-hidden"} ${leftSidebarOpen ? "" : "is-sidebar-hidden"}`}>
        {leftSidebarOpen ? (
          <LeftSidebar onCollapse={() => setLeftSidebarOpen(false)} />
        ) : (
          <button className="sidebar-open-button" type="button" onClick={() => setLeftSidebarOpen(true)} title="サイドバーを開く">
            <PanelLeftOpen size={18} />
          </button>
        )}
        <main className="canvas-region">
          <MapCanvas />
        </main>
        {selected.type && selected.id && <RightInspector />}
      </div>
      <TimelinePanel />
    </div>
  );
}
