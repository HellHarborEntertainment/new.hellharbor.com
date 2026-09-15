export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}
export const badRequest = (message: string, details?: unknown) => new AppError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Unauthorized') => new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'Forbidden') => new AppError(403, 'forbidden', message);
export const notFound = (message = 'Not found') => new AppError(404, 'not_found', message);
export const conflict = (message: string, details?: unknown) => new AppError(409, 'conflict', message, details);
export const payloadTooLarge = (message = 'Request body is too large') => new AppError(413, 'payload_too_large', message);
export const rateLimited = (message = 'Too many requests') => new AppError(429, 'rate_limited', message);
export const upstream = (message: string, details?: unknown) => new AppError(502, 'upstream_error', message, details);
