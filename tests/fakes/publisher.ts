/**
 * @file        tests/fakes/publisher.ts
 * @purpose     Fake PostPublisher that returns scripted post ids and records publish calls.
 * @covers      src/server/ports.ts
 * @spec        03-tdd-and-testing.md section 2; 04-security.md S18
 */
import type { PostPublisher, PublishInput } from '../../src/server/ports';

export class FakePublisher implements PostPublisher {
  readonly calls: PublishInput[] = [];
  publishCount = 0;

  constructor(private readonly postId = 't3_testpost') {}

  async publishDailyPost(input: PublishInput): Promise<{ postId: string }> {
    this.calls.push({ ...input });
    this.publishCount += 1;
    return { postId: this.postId };
  }
}
