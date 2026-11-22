/**
 * @file        src/server/app.ts
 * @purpose     Builds the Express app with security headers, the API and internal routers, a generic 404 and one error handler.
 * @layer       server (Express wiring)
 * @keyFunctions
 *   - createApp(deps): Express
 *   - createErrorHandler(deps): ErrorRequestHandler
 * @invariants  every response carries nosniff, no-referrer and same-origin resource policy; /api/* and /internal/* are no-store; bodies are generic JSON
 * @security    S10: generic error bodies and no stack traces; S5: security headers on every response; logs carry event and status only
 * @tests       tests/server/routes.test.ts; tests/security/apiAbuse.test.ts
 * @spec        01-spec.md section 5; 03-tdd-and-testing.md section 5b
 */
import express from 'express';
import type {
  ErrorRequestHandler,
  Express,
  NextFunction,
  Request,
  Response,
} from 'express';
import type { ApiError } from '../shared/types';
import { AppError, toErrorBody, toStatus } from './core/errors';
import { toBodyError } from './routes/body';
import { createApiRouter } from './routes/api';
import { createInternalRouter } from './routes/internal';
import type { AppDeps } from './ports';

function securityHeaders(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (
    req.path === '/api' ||
    req.path.startsWith('/api/') ||
    req.path === '/internal' ||
    req.path.startsWith('/internal/')
  ) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
}

export function createErrorHandler(deps: AppDeps): ErrorRequestHandler {
  return (error, _req, res, _next): void => {
    const mapped = toBodyError(error);
    const status = toStatus(mapped);

    if (status >= 500) {
      deps.logger.error('request_failed', status);
    }
    if (mapped instanceof AppError && mapped.retryAfterS !== undefined) {
      res.setHeader('Retry-After', String(mapped.retryAfterS));
    }

    const body: ApiError = toErrorBody(mapped);
    res.status(status).json(body);
  };
}

export function createApp(deps: AppDeps): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(securityHeaders);

  app.use('/api', createApiRouter(deps));
  app.use('/internal', createInternalRouter(deps));

  app.use((_req: Request, res: Response): void => {
    const body: ApiError = { error: 'not_found' };
    res.status(404).json(body);
  });

  app.use(createErrorHandler(deps));

  return app;
}
