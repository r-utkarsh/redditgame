/**
 * @file        src/server/routes/body.ts
 * @purpose     Enforces the body size, content type and JSON parse rules for write routes.
 * @layer       server routes
 * @keyFunctions
 *   - checkBodyHeaders
 *   - parseJsonBody
 *   - toBodyError
 * @invariants  size is checked before content type, content type before identity (by route order), parse errors map to 400/413/415 only
 * @security    S5, S7: bodies are capped at 1 KB and only JSON is parsed
 * @tests       tests/server/routes.test.ts; tests/security/apiAbuse.test.ts
 * @spec        01-spec.md section 5; 03-tdd-and-testing.md section 5b
 */
import express from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { MAX_BODY_BYTES } from '../../shared/constants';
import {
  AppError,
  badRequest,
  payloadTooLarge,
  unsupportedMediaType,
} from '../core/errors';

type BodyError = { type?: string; status?: number };

export function checkBodyHeaders(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const rawLength = req.headers['content-length'];
  const length =
    typeof rawLength === 'string' ? Number(rawLength) : Number.NaN;

  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    next(payloadTooLarge());
    return;
  }

  const hasBody =
    (Number.isFinite(length) && length > 0) ||
    req.headers['transfer-encoding'] !== undefined;

  if (hasBody) {
    const contentType = req.headers['content-type'] ?? '';
    if (!/^application\/json(?:;|$)/i.test(contentType.trim())) {
      next(unsupportedMediaType());
      return;
    }
  }

  next();
}

const jsonParser = express.json({
  limit: MAX_BODY_BYTES,
  strict: true,
});

export function toBodyError(error: unknown): unknown {
  if (error instanceof AppError) {
    return error;
  }

  const record = error as BodyError;
  if (record?.type === 'entity.too.large' || record?.status === 413) {
    return payloadTooLarge();
  }
  if (
    record?.type === 'encoding.unsupported' ||
    record?.type === 'charset.unsupported'
  ) {
    return unsupportedMediaType();
  }
  if (
    record?.type === 'entity.parse.failed' ||
    record?.status === 400 ||
    record?.type === 'request.aborted'
  ) {
    return badRequest();
  }

  return error;
}

export const parseJsonBody: RequestHandler = (req, res, next) => {
  jsonParser(req, res, (error?: unknown) => {
    if (error) {
      next(toBodyError(error));
      return;
    }
    next();
  });
};
