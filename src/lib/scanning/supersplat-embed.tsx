import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ToothAnnotation } from './types';

export type SuperSplatMode = 'editor' | 'viewer';

export interface SuperSplatEmbedProps {
  splatUrl: string;
  mode?: SuperSplatMode;
  annotations?: ToothAnnotation[];
  onAnnotationClick?: (annotation: ToothAnnotation) => void;
  onCameraPose?: (pose: { tMs: number; position: [number, number, number]; target: [number, number, number]; fovDeg: number }) => void;
  editorOrigin?: string;
  className?: string;
  style?: CSSProperties;
  height?: number | string;
}

interface ProjectedAnnotation extends ToothAnnotation {
  screen: { x: number; y: number; visible: boolean };
}

const DEFAULT_EDITOR_ORIGIN = 'https://superspl.at';

/**
 * Embed surface for Arcline's Gaussian Splat scans.
 *
 * `mode='editor'` iframes the SuperSplat editor (or our self-hosted fork) for
 * doctor authoring. `mode='viewer'` mounts a lightweight PlayCanvas-based
 * viewer for patient review with DOM-overlay tooth annotations.
 *
 * The viewer renderer lives in a separate module that lazy-loads
 * `playcanvas` + `@playcanvas/react`; this file only owns the React surface
 * and the annotation projection contract.
 */
export function SuperSplatEmbed({
  splatUrl,
  mode = 'viewer',
  annotations = [],
  onAnnotationClick,
  onCameraPose,
  editorOrigin = DEFAULT_EDITOR_ORIGIN,
  className,
  style,
  height = '80vh',
}: SuperSplatEmbedProps) {
  if (mode === 'editor') {
    return (
      <EditorIframe
        splatUrl={splatUrl}
        editorOrigin={editorOrigin}
        className={className}
        style={style}
        height={height}
      />
    );
  }

  return (
    <ViewerSurface
      splatUrl={splatUrl}
      annotations={annotations}
      onAnnotationClick={onAnnotationClick}
      onCameraPose={onCameraPose}
      className={className}
      style={style}
      height={height}
    />
  );
}

function EditorIframe({
  splatUrl,
  editorOrigin,
  className,
  style,
  height,
}: {
  splatUrl: string;
  editorOrigin: string;
  className?: string;
  style?: CSSProperties;
  height: number | string;
}) {
  const src = useMemo(
    () => `${editorOrigin}/editor?load=${encodeURIComponent(splatUrl)}`,
    [editorOrigin, splatUrl]
  );

  return (
    <iframe
      title="SuperSplat editor"
      src={src}
      className={className}
      style={{ width: '100%', height, border: 0, ...style }}
      allow="clipboard-write; fullscreen"
      sandbox="allow-scripts allow-same-origin allow-downloads allow-forms"
    />
  );
}

function ViewerSurface({
  splatUrl,
  annotations,
  onAnnotationClick,
  onCameraPose,
  className,
  style,
  height,
}: {
  splatUrl: string;
  annotations: ToothAnnotation[];
  onAnnotationClick?: (a: ToothAnnotation) => void;
  onCameraPose?: SuperSplatEmbedProps['onCameraPose'];
  className?: string;
  style?: CSSProperties;
  height: number | string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [projected, setProjected] = useState<ProjectedAnnotation[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let dispose: (() => void) | undefined;

    (async () => {
      const { mountSplatViewer } = await import('./viewer/playcanvas-splat-viewer');
      if (disposed) return;
      const handle = await mountSplatViewer({
        canvas,
        splatUrl,
        onCameraPose,
        onAnnotationsProjected: setProjected,
        getAnnotations: () => annotations,
      });
      dispose = handle.dispose;
    })();

    return () => {
      disposed = true;
      dispose?.();
    };
  }, [splatUrl, annotations, onCameraPose]);

  return (
    <div
      className={className}
      style={{ position: 'relative', width: '100%', height, ...style }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {projected
          .filter((a) => a.screen.visible)
          .map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onAnnotationClick?.(a)}
              style={{
                position: 'absolute',
                left: a.screen.x,
                top: a.screen.y,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'auto',
              }}
              data-tooth={a.toothNumber}
              data-kind={a.kind}
              aria-label={`Tooth ${a.toothNumber}: ${a.kind}`}
            />
          ))}
      </div>
    </div>
  );
}
