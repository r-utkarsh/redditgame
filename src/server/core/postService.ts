/**
 * @file        src/server/core/postService.ts
 * @purpose     Creates the daily post once through the dpost claim and provides the moderator-menu recovery path.
 * @layer       server core
 * @keyFunctions
 *   - DailyPostResponse
 *   - createDailyPost(deps): Promise<DailyPostResponse>
 *   - createPostFromMenu(deps): Promise<DailyPostResponse>
 * @invariants  the claim is one hSetNX with a 60 s TTL; the scheduler reports in_progress while the claim is held; the menu never reports in_progress; a failed publish releases the claim
 * @security    S18: one post per day, idempotent reruns, the post mapping is repaired from the stored postId
 * @tests       tests/server/postService.test.ts
 * @spec        01-spec.md section 5; 04-security.md S18
 */
import { DAY_KEY_TTL_DAYS, DPOST_CLAIM_TTL_S } from '../../shared/constants';
import { toDateKey } from '../../shared/dates';
import { unavailable } from './errors';
import { dpostKey, postKey } from './redisKeys';
import type { Clock, Logger, PostPublisher, Store } from '../ports';

export type DailyPostResponse = {
  ok: true;
  status: 'created' | 'exists' | 'in_progress';
  dateKey: string;
  postId?: string;
};

type PostDeps = {
  store: Store;
  clock: Clock;
  publisher: PostPublisher;
  logger: Logger;
};

/** Daily post copy approved as a draft in D-023; explicit developer approval is still required before a real-subreddit schedule. */
const POST_TITLE = "Fault Lines - can you find today's epicenter?";
const POST_BODY =
  "The seismographs recorded today's quake. Read the S-P delays, place your pin, and lock in before midnight UTC; one guess per day.";

const MAPPING_TTL_S = DAY_KEY_TTL_DAYS * 86400;

async function readPostId(
  deps: PostDeps,
  dateKey: string
): Promise<string | null> {
  try {
    return await deps.store.hGet(dpostKey(dateKey), 'postId');
  } catch {
    throw unavailable();
  }
}

async function claimDay(deps: PostDeps, dateKey: string): Promise<boolean> {
  try {
    return await deps.store.hSetNX(dpostKey(dateKey), 'claim', '1');
  } catch {
    throw unavailable();
  }
}

async function releaseClaim(deps: PostDeps, dateKey: string): Promise<void> {
  try {
    await deps.store.del(dpostKey(dateKey));
  } catch {
    deps.logger.error('dpost_release_failed');
  }
}

async function storePostId(
  deps: PostDeps,
  dateKey: string,
  postId: string
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await deps.store.hSet(dpostKey(dateKey), 'postId', postId);
      await deps.store.expire(dpostKey(dateKey), MAPPING_TTL_S);
      return;
    } catch {
      if (attempt === 1) {
        deps.logger.error('dpost_write_failed');
      }
    }
  }
}

async function storePostMapping(
  deps: PostDeps,
  postId: string,
  dateKey: string
): Promise<void> {
  let key: string;
  try {
    key = postKey(postId);
  } catch {
    deps.logger.error('post_mapping_invalid');
    return;
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await deps.store.set(key, dateKey);
      await deps.store.expire(key, MAPPING_TTL_S);
      return;
    } catch {
      if (attempt === 1) {
        deps.logger.error('post_mapping_failed');
      }
    }
  }
}

async function publish(
  deps: PostDeps,
  dateKey: string
): Promise<DailyPostResponse> {
  let postId: string;
  try {
    const published = await deps.publisher.publishDailyPost({
      dateKey,
      title: POST_TITLE,
      body: POST_BODY,
    });
    postId = published.postId;
  } catch {
    deps.logger.error('post_publish_failed', 503);
    await releaseClaim(deps, dateKey);
    throw unavailable();
  }

  await storePostId(deps, dateKey, postId);
  await storePostMapping(deps, postId, dateKey);

  return { ok: true, status: 'created', dateKey, postId };
}

async function claimAndExpire(
  deps: PostDeps,
  dateKey: string
): Promise<boolean> {
  const claimed = await claimDay(deps, dateKey);
  if (!claimed) {
    return false;
  }

  try {
    await deps.store.expire(dpostKey(dateKey), DPOST_CLAIM_TTL_S);
  } catch {
    await releaseClaim(deps, dateKey);
    throw unavailable();
  }

  return true;
}

export async function createDailyPost(
  deps: PostDeps
): Promise<DailyPostResponse> {
  const dateKey = toDateKey(deps.clock.now());

  if (!(await claimAndExpire(deps, dateKey))) {
    return { ok: true, status: 'in_progress', dateKey };
  }

  const existing = await readPostId(deps, dateKey);
  if (existing !== null) {
    return { ok: true, status: 'exists', dateKey, postId: existing };
  }

  return publish(deps, dateKey);
}

export async function createPostFromMenu(
  deps: PostDeps
): Promise<DailyPostResponse> {
  const dateKey = toDateKey(deps.clock.now());
  const existing = await readPostId(deps, dateKey);

  if (existing !== null) {
    await storePostMapping(deps, existing, dateKey);
    return { ok: true, status: 'exists', dateKey, postId: existing };
  }

  if (!(await claimAndExpire(deps, dateKey))) {
    throw unavailable();
  }

  return publish(deps, dateKey);
}
