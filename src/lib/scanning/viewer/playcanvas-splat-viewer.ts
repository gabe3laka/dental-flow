import type { ToothAnnotation } from '../types';

export interface ProjectedAnnotation extends ToothAnnotation {
  screen: { x: number; y: number; visible: boolean };
}

export interface MountSplatViewerOptions {
  canvas: HTMLCanvasElement;
  splatUrl: string;
  getAnnotations: () => ToothAnnotation[];
  onAnnotationsProjected: (projected: ProjectedAnnotation[]) => void;
  onCameraPose?: (pose: {
    tMs: number;
    position: [number, number, number];
    target: [number, number, number];
    fovDeg: number;
  }) => void;
}

export interface SplatViewerHandle {
  dispose: () => void;
}

/**
 * Stub. Real implementation will:
 *  1. `import { Application, Entity, GSplatComponent } from 'playcanvas'`.
 *  2. Boot a PlayCanvas Application bound to `opts.canvas`.
 *  3. Fetch `opts.splatUrl` and instantiate a GSplatComponent.
 *  4. Wire orbit controls + pose emit @ 10 Hz to `opts.onCameraPose`.
 *  5. Each frame, project `opts.getAnnotations()` world-space positions to
 *     screen coords and call `opts.onAnnotationsProjected`.
 *
 * Until `playcanvas` is added as a dep, this stub renders nothing and
 * surfaces an empty annotation overlay so the React layer compiles.
 */
export async function mountSplatViewer(
  opts: MountSplatViewerOptions
): Promise<SplatViewerHandle> {
  opts.onAnnotationsProjected([]);
  return {
    dispose: () => {
      /* no-op until real viewer ships */
    },
  };
}
