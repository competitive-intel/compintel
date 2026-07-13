export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
