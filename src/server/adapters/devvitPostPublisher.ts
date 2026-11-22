/**
 * @file        src/server/adapters/devvitPostPublisher.ts
 * @purpose     Implements the PostPublisher port by creating a custom post through the Devvit Reddit client.
 * @layer       server adapters (the only place the Reddit client is imported for publishing)
 * @keyFunctions
 *   - DevvitReddit
 *   - DevvitPostContext
 *   - createDevvitPostPublisher(client?, readContext?): PostPublisher
 * @invariants  the splash entrypoint is the post entry; the body is the old.reddit text fallback; the post is created as the app; a missing id throws
 * @security    S18: the caller holds the dpost claim; S10: errors carry no ids; no client-supplied title or body
 * @tests       tests/server/adapters.test.ts
 * @spec        02-architecture-and-headers.md section 1; 04-security.md S18; P3-devvit-wiring.md step 5
 */
import { context, reddit } from '@devvit/web/server';
import type { PostPublisher } from '../ports';

export type DevvitReddit = {
  submitCustomPost(options: {
    subredditName: string;
    title: string;
    entry?: string;
    textFallback?: { text: string };
    runAs?: 'USER' | 'APP';
  }): Promise<{ id?: string }>;
};

export type DevvitPostContext = {
  subredditName: string;
};

export function createDevvitPostPublisher(
  client: DevvitReddit = reddit,
  readContext: () => DevvitPostContext = () => context
): PostPublisher {
  return {
    async publishDailyPost({ title, body }) {
      const post = await client.submitCustomPost({
        subredditName: readContext().subredditName,
        title,
        entry: 'default',
        textFallback: { text: body },
        runAs: 'APP',
      });

      if (!post.id) {
        throw new Error('missing post id');
      }

      return { postId: post.id };
    },
  };
}
