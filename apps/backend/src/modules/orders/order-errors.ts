export class OrderEngineError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, status: number, message: string, details?: unknown) {
    super(message);
    this.name = "OrderEngineError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isOrderEngineError(error: unknown): error is OrderEngineError {
  return error instanceof OrderEngineError;
}
