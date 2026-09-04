export class CrawlerError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, retryable = false) {
    super(code);
    this.name = "CrawlerError";
    this.code = code;
    this.retryable = retryable;
  }
}

export const toCrawlerError = (error: unknown): CrawlerError =>
  error instanceof CrawlerError ? error : new CrawlerError("CRAWL_REQUEST_FAILED", true);
