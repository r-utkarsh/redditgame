/**
 * @file        src/server/routes/api.ts
 * @purpose     Wires the three public API routes to identity, rate limits, body checks and the core services.
 * @layer       server routes
 * @keyFunctions
 *   - ApiLocals
 *   - requireIdentity(deps): RequestHandler
 *   - enforceRate(deps, kind): RequestHandler
 *   - createApiRouter(deps): Router
 * @invariants  check order is route, method, size, content type, identity, rate limit, schema, logic; errors always answer generic JSON
 * @security    S4, S5, S6, S8, S10: identity only from Identity and shape-checked, rate limits before expensive work, generic errors
 * @tests       tests/server/routes.test.ts; tests/security/apiAbuse.test.ts
 * @spec        01-spec.md section 5; 03-tdd-and-testing.md sections 5 and 5b
 */
import { Router } from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ApiError } from '../../shared/types';
import { parseGuessRequest } from '../../shared/validation';
import { badRequest, unauthorized } from '../core/errors';
import { isValidUserId } from '../core/redisKeys';
import { submitGuess } from '../core/guessService';
import { getPuzzle, resolvePostDateKey } from '../core/puzzleService';
import { checkRate } from '../core/rateLimit';
import { getResults } from '../core/resultsService';
import { checkBodyHeaders, parseJsonBody } from './body';
import type { AppDeps } from '../ports';

export type ApiLocals = {
  userId: string;
  postId?: string;
};

function localsOf(res: Response): ApiLocals {
  return res.locals as ApiLocals;
}

export function requireIdentity(deps: AppDeps): RequestHandler {
  return async (_req: Request, res: Response, next: NextFunction) => {
    const identity = await deps.identity.get();
    if (!identity || !isValidUserId(identity.userId)) {
      next(unauthorized());
      return;
    }
    const locals = localsOf(res);
    locals.userId = identity.userId;
    locals.postId = identity.postId;
    next();
  };
}

export function enforceRate(
  deps: AppDeps,
  kind: 'guess' | 'read'
): RequestHandler {
  return async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await checkRate(deps, localsOf(res).userId, kind);
      next();
    } catch (error: unknown) {
      next(error);
    }
  };
}

function notAllowed(_req: Request, res: Response): void {
  const body: ApiError = { error: 'method_not_allowed' };
  res.status(405).json(body);
}

export function createApiRouter(deps: AppDeps): Router {
  const router = Router();

  router.head('/puzzle', notAllowed);
  router.get('/puzzle', requireIdentity(deps), enforceRate(deps, 'read'), async (
    _req: Request,
    res: Response
  ) => {
    const locals = localsOf(res);
    res.status(200).json(await getPuzzle(deps, locals.userId, locals.postId));
  });
  router.all('/puzzle', notAllowed);

  router.head('/guess', notAllowed);
  router.post(
    '/guess',
    checkBodyHeaders,
    requireIdentity(deps),
    enforceRate(deps, 'guess'),
    parseJsonBody,
    async (req: Request, res: Response) => {
      const guess = parseGuessRequest(req.body);
      if (!guess) {
        throw badRequest();
      }

      const locals = localsOf(res);
      const dateKey = await resolvePostDateKey(deps, locals.postId);
      res
        .status(200)
        .json(await submitGuess(deps, locals.userId, dateKey, guess));
    }
  );
  router.all('/guess', notAllowed);

  router.head('/results', notAllowed);
  router.get('/results', requireIdentity(deps), enforceRate(deps, 'read'), async (
    _req: Request,
    res: Response
  ) => {
    const locals = localsOf(res);
    res
      .status(200)
      .json(await getResults(deps, locals.userId, locals.postId));
  });
  router.all('/results', notAllowed);

  return router;
}
