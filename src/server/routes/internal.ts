/**
 * @file        src/server/routes/internal.ts
 * @purpose     Wires the scheduler and moderator-menu post creation endpoints without client identity.
 * @layer       server routes
 * @keyFunctions
 *   - validateInternalBody(value): void
 *   - createInternalRouter(deps): Router
 * @invariants  payload must be absent or a JSON object; invalid input changes no state; only POST is allowed
 * @security    S15, S18: never called by the client, no shared secret, minimal JSON, idempotent
 * @tests       tests/security/internalAbuse.test.ts
 * @spec        01-spec.md section 5; 04-security.md S15, S18
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ApiError } from '../../shared/types';
import { badRequest } from '../core/errors';
import {
  createDailyPost,
  createPostFromMenu,
} from '../core/postService';
import { checkBodyHeaders, parseJsonBody } from './body';
import type { AppDeps } from '../ports';

export function validateInternalBody(value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  if (
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw badRequest();
  }
}

function notAllowed(_req: Request, res: Response): void {
  const body: ApiError = { error: 'method_not_allowed' };
  res.status(405).json(body);
}

export function createInternalRouter(deps: AppDeps): Router {
  const router = Router();

  router.head('/scheduler/daily-puzzle', notAllowed);
  router.post(
    '/scheduler/daily-puzzle',
    checkBodyHeaders,
    parseJsonBody,
    async (req: Request, res: Response) => {
      validateInternalBody(req.body);
      res.status(200).json(await createDailyPost(deps));
    }
  );
  router.all('/scheduler/daily-puzzle', notAllowed);

  router.head('/menu/create-post', notAllowed);
  router.post(
    '/menu/create-post',
    checkBodyHeaders,
    parseJsonBody,
    async (req: Request, res: Response) => {
      validateInternalBody(req.body);
      res.status(200).json(await createPostFromMenu(deps));
    }
  );
  router.all('/menu/create-post', notAllowed);

  return router;
}
