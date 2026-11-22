/**
 * @file        src/server/adapters/devvitIdentity.ts
 * @purpose     Implements the Identity port from the Devvit request context; no body, query or header can supply an id.
 * @layer       server adapters (the only place the Devvit context is imported)
 * @keyFunctions
 *   - DevvitIdentityContext
 *   - createDevvitIdentity(readContext?): Identity
 * @invariants  a missing or empty userId returns null, which the API maps to 401; postId is optional and never invented
 * @security    S4: the only source of userId is the platform context
 * @tests       tests/server/adapters.test.ts
 * @spec        02-architecture-and-headers.md section 1; 04-security.md S4; P3-devvit-wiring.md step 5
 */
import { context } from '@devvit/web/server';
import type { Identity } from '../ports';

export type DevvitIdentityContext = {
  userId?: string;
  postId?: string;
};

export function createDevvitIdentity(
  readContext: () => DevvitIdentityContext = () => context
): Identity {
  return {
    async get() {
      const current = readContext();
      if (!current.userId) {
        return null;
      }
      if (!current.postId) {
        return { userId: current.userId };
      }
      return { userId: current.userId, postId: current.postId };
    },
  };
}
