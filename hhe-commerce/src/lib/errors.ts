export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
export const badRequest = (message: string, details?: unknown) => new AppError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Unauthorized') => new AppError(401, 'unauthorized', message);
export const notFound = (message = 'Not found') => new AppError(404, 'not_found', message);
export const conflict = (message: string) => new AppError(409, 'conflict', message);
export const upstream = (message: string, details?: unknown) => new AppError(502, 'upstream_error', message, details);
