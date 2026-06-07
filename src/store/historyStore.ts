import type { ProjectData } from "../types/project";

export function cloneProject(project: ProjectData): ProjectData {
  return structuredClone(project);
}

export function trimHistory(history: ProjectData[], max = 80) {
  return history.length > max ? history.slice(history.length - max) : history;
}
