import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import type { ProjectSummary } from "../api/client.js";

export function ProjectSelector({
  projects,
  projectId,
  disabled,
  onChange,
}: {
  projects: ProjectSummary[];
  projectId: string;
  disabled?: boolean;
  onChange(projectId: string): void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const currentProject = projects.find((project) => project.projectId === projectId);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="character-project-selector" ref={ref}>
      <span className="character-project-label">当前项目</span>
      <button
        type="button"
        className="character-project-button"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled || projects.length === 0}
      >
        <span>{currentProject?.title ?? "暂无项目"}</span>
        <ChevronDown size={15} strokeWidth={1.8} />
      </button>
      {open ? (
        <div className="character-project-menu">
          {projects.length ? (
            projects.map((project) => (
              <button
                type="button"
                className={project.projectId === projectId ? "active" : ""}
                key={project.projectId}
                onClick={() => {
                  onChange(project.projectId);
                  setOpen(false);
                }}
              >
                <span>{project.title}</span>
                <small>{project.projectId}</small>
              </button>
            ))
          ) : (
            <div className="character-project-empty">暂无项目，请先去「项目」页新建一本书</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
