/**
 * @file        tests/fakes/appHarness.ts
 * @purpose     Starts the Express app on an ephemeral port for fetch-based route tests.
 * @covers      src/server/app.ts
 * @spec        03-tdd-and-testing.md sections 2 and 5b
 */
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../src/server/app';
import type { FakeDeps } from './deps';
import { toDeps } from './deps';

export type TestApp = {
  baseUrl: string;
  deps: FakeDeps;
  close(): Promise<void>;
};

export async function startTestApp(deps: FakeDeps): Promise<TestApp> {
  const app = createApp(toDeps(deps));
  const server: Server = app.listen(0, '127.0.0.1');

  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    deps,
    close() {
      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}
