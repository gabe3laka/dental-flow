export type ScanDevice = 'scope' | 'wand' | 'phone-bare';

export type ScanStatus =
  | 'capturing'
  | 'uploading'
  | 'uploaded'
  | 'reconstructing'
  | 'reconstructed'
  | 'training_splat'
  | 'complete'
  | 'failed';

export type ScanTier = 'monitoring' | 'visualization';

export type ToothNumberingSystem = 'fdi' | 'universal';

export type AnnotationKind =
  | 'decay'
  | 'recession'
  | 'plaque'
  | 'wear'
  | 'restoration'
  | 'note';

export type ToothSurface =
  | 'occlusal'
  | 'incisal'
  | 'mesial'
  | 'distal'
  | 'buccal'
  | 'lingual'
  | 'palatal';

export interface ScanSession {
  id: string;
  patientId: string;
  device: ScanDevice;
  startedAt: string;
  endedAt?: string;
  status: ScanStatus;
  tier: ScanTier;
  rawVideoPath: string;
  durationSec?: number;
  framesCaptured?: number;
  failureReason?: string;
  failureStage?: 'capture' | 'upload' | 'reconstruct' | 'train' | 'unknown';
}

export interface CameraPose {
  frameIndex: number;
  timestampMs: number;
  position: [number, number, number];
  rotationQuat: [number, number, number, number];
  fovDeg: number;
}

export interface ScanResult {
  scanId: string;
  tier: ScanTier;
  pointCloudPath?: string;
  splatPath?: string;
  posesPath: string;
  framesCount: number;
  reconstructedAt: string;
  qualityMetrics: {
    confidenceMean: number;
    confidenceP10: number;
    poseStability: number;
    coverage?: number;
  };
  modelVersion: {
    lingbotMap: string;
    splatTrainer?: string;
  };
}

export interface ToothAnnotation {
  id: string;
  scanId: string;
  toothNumber: string;
  numberingSystem: ToothNumberingSystem;
  position: [number, number, number];
  surface?: ToothSurface;
  kind: AnnotationKind;
  severity?: 1 | 2 | 3 | 4 | 5;
  note: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AnnotationTimelineEvent {
  tMs: number;
  annotationId: string;
  kind: 'add' | 'edit' | 'focus';
}

export interface DoctorReview {
  id: string;
  scanId: string;
  doctorId: string;
  videoPath: string;
  durationMs: number;
  cameraPath: Array<{
    tMs: number;
    position: [number, number, number];
    target: [number, number, number];
    fovDeg: number;
  }>;
  annotationEvents: AnnotationTimelineEvent[];
  recordedAt: string;
  publishedAt?: string;
}

export interface ScanProgressDelta {
  fromScanId: string;
  toScanId: string;
  computedAt: string;
  perTooth: Array<{
    toothNumber: string;
    numberingSystem: ToothNumberingSystem;
    recessionDeltaMm?: number;
    movementDeltaMm?: number;
    decaySurfaceMm2?: number;
  }>;
}
