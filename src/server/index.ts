/**
 * @file        src/server/index.ts
 * @purpose     Wires the Devvit adapters into the Express app and starts it on the Devvit-provided server and port.
 * @layer       server (bootstrap)
 * @keyFunctions
 *   - buildDeps(): AppDeps
 *   - startServer(): void
 * @invariants  uses only the Devvit server factory and port; no hard-coded port; Devvit imports live only here and in adapters
 * @security    S4: identity comes from the request context; S19: the seed comes from secure entropy; S10: the logger prints event names only
 * @tests       none (bootstrap; documented coverage exclusion D-015)
 * @spec        02-architecture-and-headers.md section 3; D-011; P3-devvit-wiring.md steps 5 and 6
 */
import { context, createServer, getServerPort, reddit } from '@devvit/web/server';
import { createEntropy } from './adapters/entropy';
import { createDevvitIdentity } from './adapters/devvitIdentity';
import { createDevvitPostPublisher } from './adapters/devvitPostPublisher';
import { createDevvitStore } from './adapters/devvitStore';
import { createDevvitTracker } from './adapters/devvitTracker';
import { createSystemClock } from './adapters/systemClock';
import { createApp } from './app';
import { createLogger } from './core/logger';
import type { AppDeps } from './ports';

export function buildDeps(): AppDeps {
  return {
    store: createDevvitStore(),
    clock: createSystemClock(),
    entropy: createEntropy(),
    tracker: createDevvitTracker(),
    publisher: createDevvitPostPublisher(reddit, () => context),
    identity: createDevvitIdentity(() => context),
    logger: createLogger(),
  };
}

export function startServer(): void {
  const app = createApp(buildDeps());
  const server = createServer(app);
  server.listen(getServerPort());
}

startServer();
