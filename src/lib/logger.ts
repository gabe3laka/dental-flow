export interface LogContext {
  operation: string;
  userId?: string;
  extra?: Record<string, unknown>;
}

export function logError(error: unknown, context: LogContext): void {
  const entry = {
    timestamp: new Date().toISOString(),
    operation: context.operation,
    userId: context.userId ?? "anonymous",
    error: error instanceof Error
      ? { message: error.message, stack: error.stack }
      : String(error),
    ...(context.extra ?? {}),
  };
  console.error("[arcline]", entry);
}
