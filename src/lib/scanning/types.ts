export type ScanDevice = 'scope' | 'wand' | 'phone-bare';

export type ScanStatus =
  | 'pending'
  | 'reviewed'
  | 'flagged'
  | 'action_required';

export type ProcessingStatus =
  | 'queued'
  | 'uploading'
  | 'processing'
  | 'complete'
  | 'failed';

export type ScanType = 'scope' | 'wand';

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
  scanType: ScanType;
  startedAt: string;
  endedAt?: string;
  status: ScanStatus;
  processingStatus: ProcessingStatus;
  rawVideoUrl: string | null;
  pointcloudUrl: string | null;
  durationSec?: number;
  framesCaptured?: number;
  failureReason?: string;
}

export interface ScanResult {
  scanId: string;
  pointcloudUrl: string;
  reconstructedAt: string;
  framesCount: number;
  qualityMetrics: {
    confidenceMean: number;
    confidenceP10: number;
    poseStability: number;
    coverage?: number;
  };
  modelVersion: {
    lingbotMap: string;
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

export interface ReviewComment {
  id: string;
  tMs: number;
  text: string;
  authorId: string;
  createdAt: string;
  position?: [number, number, number];
}

export interface DoctorReview {
  id: string;
  scanId: string;
  doctorId: string;
  videoUrl: string | null;
  reviewNotes: string | null;
  comments: ReviewComment[];
  reviewedAt: string;
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
