import type { CSSProperties } from "react";

// NOTE — future self-host migration.
// Today this points at PlayCanvas's hosted SuperSplat editor
// (https://superspl.at). For a HIPAA-friendly production deployment, host a
// fork of https://github.com/playcanvas/supersplat under our own subdomain
// (e.g. https://editor.dental-flow.app) and flip DEFAULT_BASE below. Doing
// so keeps the `.ply` (which is PHI-derived) on origins we control.
const DEFAULT_BASE = "https://superspl.at/editor";

export interface SuperSplatEmbedProps {
  /** Signed URL pointing at a `.ply` or `.splat` file. */
  fileUrl: string;
  /** Optional override for the editor base URL (e.g. self-hosted instance). */
  editorBase?: string;
  /** Optional file name to hint SuperSplat's UI. */
  filename?: string;
  className?: string;
  style?: CSSProperties;
  /** CSS height. Defaults to `70vh`. */
  height?: number | string;
}

/**
 * Minimal embed wrapper around the SuperSplat editor (MIT, PlayCanvas Ltd).
 *
 * Contract verified against upstream `src/main.ts`:
 *   url.searchParams.getAll('load')      → array of file URLs to load
 *   url.searchParams.getAll('filename')  → optional display names
 *
 * Sandboxed to deny top-navigation; iframe still needs scripts + same-origin
 * for WebGL + clipboard + downloads to work inside the editor's UI.
 */
export function SuperSplatEmbed({
  fileUrl,
  editorBase = DEFAULT_BASE,
  filename = "pointcloud.ply",
  className,
  style,
  height = "70vh",
}: SuperSplatEmbedProps) {
  const src =
    `${editorBase}?load=${encodeURIComponent(fileUrl)}` +
    `&filename=${encodeURIComponent(filename)}`;

  return (
    <iframe
      title="SuperSplat viewer"
      src={src}
      className={className}
      style={{ width: "100%", height, border: 0, borderRadius: 12, ...style }}
      allow="clipboard-write; fullscreen"
      sandbox="allow-scripts allow-same-origin allow-downloads allow-forms allow-popups"
    />
  );
}
