import type { ScanSession } from './types';

export interface LingbotJobRequest {
  scanId: string;
  videoUrl: string;
  callbackUrl: string;
  mode?: 'stream' | 'windowed';
  fps?: number;
  keyframeInterval?: number;
  cameraNumIterations?: number;
  windowSize?: number;
  overlapKeyframes?: number;
}

export interface LingbotJobAccepted {
  scanId: string;
  status: 'accepted';
  queuedAt: string;
}

export interface LingbotJobError {
  scanId: string;
  status: 'error';
  error: string;
  retryable: boolean;
}

export type LingbotDispatchResult = LingbotJobAccepted | LingbotJobError;

export interface LingbotCallbackPayload {
  scanId: string;
  status: 'complete' | 'failed';
  outputs?: {
    pointCloudPath: string;
    posesPath: string;
    framesPath?: string;
  };
  metrics?: {
    confidenceMean: number;
    confidenceP10: number;
    poseStability: number;
    framesProcessed: number;
    wallClockSec: number;
  };
  modelVersion?: string;
  error?: string;
}

export interface LingbotClientConfig {
  baseUrl: string;
  apiToken: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DENTAL_DEFAULTS = {
  fps: 15,
  keyframeInterval: 2,
  cameraNumIterations: 2,
  windowSize: 128,
  overlapKeyframes: 16,
} as const;

export class LingbotClient {
  private readonly baseUrl: string;
  private readonly apiToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(config: LingbotClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiToken = config.apiToken;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  async dispatch(req: LingbotJobRequest): Promise<LingbotDispatchResult> {
    const body: LingbotJobRequest = {
      mode: 'stream',
      fps: DENTAL_DEFAULTS.fps,
      keyframeInterval: DENTAL_DEFAULTS.keyframeInterval,
      cameraNumIterations: DENTAL_DEFAULTS.cameraNumIterations,
      ...req,
    };
    if (body.mode === 'windowed') {
      body.windowSize ??= DENTAL_DEFAULTS.windowSize;
      body.overlapKeyframes ??= DENTAL_DEFAULTS.overlapKeyframes;
    }

    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/v1/reconstruct`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiToken}`,
        },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });

      if (!res.ok) {
        return {
          scanId: req.scanId,
          status: 'error',
          error: `HTTP ${res.status}: ${await res.text().catch(() => '')}`,
          retryable: res.status >= 500 || res.status === 429,
        };
      }
      return (await res.json()) as LingbotJobAccepted;
    } catch (err) {
      const aborted = (err as Error)?.name === 'AbortError';
      return {
        scanId: req.scanId,
        status: 'error',
        error: aborted ? 'timeout' : (err as Error).message,
        retryable: true,
      };
    } finally {
      clearTimeout(t);
    }
  }
}

export function chooseDispatchMode(session: Pick<ScanSession, 'device' | 'durationSec'>): 'stream' | 'windowed' {
  if (session.device === 'wand') return 'windowed';
  if ((session.durationSec ?? 0) > 90) return 'windowed';
  return 'stream';
}
