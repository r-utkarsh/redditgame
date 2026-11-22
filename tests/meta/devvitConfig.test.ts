/**
 * @file        tests/meta/devvitConfig.test.ts
 * @purpose     Proves the Devvit config uses least privilege, keeps moderator-only menu actions and schedules one daily job whose endpoints exist.
 * @covers      devvit.json, src/server/routes/internal.ts
 * @spec        04-security.md S14, S15, S18; P3-devvit-wiring.md steps 3 and 4; D-023, D-025
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { TestApp } from '../fakes/appHarness';
import { startTestApp } from '../fakes/appHarness';
import { makeDeps } from '../fakes/deps';

type Entrypoint = {
  entry: string;
  height: string;
};

type Config = {
  $schema: string;
  name: string;
  dev?: {
    subreddit?: string;
  };
  post: {
    dir: string;
    entrypoints: Record<string, Entrypoint>;
  };
  server: {
    dir: string;
    entry: string;
  };
  permissions: Record<string, unknown>;
  menu: {
    items: Array<{
      label: string;
      description: string;
      forUserType: string;
      location: string | string[];
      endpoint: string;
      postFilter?: string;
    }>;
  };
  scheduler: {
    tasks: Record<string, { endpoint: string; cron?: string }>;
  };
  scripts: {
    build: string;
  };
};

const CONFIG_PATH = new URL('../../devvit.json', import.meta.url);
const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as Config;

let app: TestApp | undefined;

afterEach(async () => {
  if (app) {
    await app.close();
    app = undefined;
  }
});

function internalEndpoints(): string[] {
  return [
    ...Object.values(config.scheduler.tasks).map((task) => task.endpoint),
    ...config.menu.items.map((item) => item.endpoint),
  ];
}

describe('devvit.json permissions', () => {
  it('enables only redis and reddit', () => {
    expect(Object.keys(config.permissions).sort()).toEqual([
      'reddit',
      'redis',
    ]);
    expect(config.permissions.redis).toBe(true);
    expect(config.permissions.reddit).toBe(true);
  });

  it('declares no http, media, payments or journeys permission', () => {
    for (const key of ['http', 'media', 'payments', 'journeys', 'blob']) {
      expect(config.permissions).not.toHaveProperty(key);
    }
  });

  it('contains no top-level key outside the reviewed allowlist', () => {
    expect(Object.keys(config).sort()).toEqual([
      '$schema',
      'dev',
      'menu',
      'name',
      'permissions',
      'post',
      'scheduler',
      'scripts',
      'server',
    ]);
  });
});

describe('devvit.json app shape', () => {
  it('uses the approved app slug and generated playtest subreddit', () => {
    expect(config.name).toBe('fault-lines-game');
    expect(config.dev?.subreddit).toBe('fault_lines_game_dev');
    expect(config.name).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(config.name.length).toBeGreaterThanOrEqual(3);
    expect(config.name.length).toBeLessThanOrEqual(20);
  });

  it('keeps the splash default and the tall game entrypoint', () => {
    expect(config.post.dir).toBe('dist/client');
    expect(config.post.entrypoints.default).toEqual({
      entry: 'splash.html',
      height: 'regular',
    });
    expect(config.post.entrypoints.game).toEqual({
      entry: 'game.html',
      height: 'tall',
    });
    expect(config.server).toEqual({
      dir: 'dist/server',
      entry: 'index.cjs',
    });
  });

  it('builds through the command devvit.json declares', () => {
    expect(config.scripts.build).toBe('vite build');
  });
});

describe('devvit.json scheduler', () => {
  it('declares one daily task at midnight UTC', () => {
    expect(Object.keys(config.scheduler.tasks)).toEqual(['daily-puzzle']);
    expect(config.scheduler.tasks['daily-puzzle']).toEqual({
      endpoint: '/internal/scheduler/daily-puzzle',
      cron: '0 0 * * *',
    });
  });

  it('uses internal endpoints only', () => {
    for (const endpoint of internalEndpoints()) {
      expect(endpoint).toMatch(/^\/internal\/.+/);
    }
  });
});

describe('devvit.json menu', () => {
  it('shows the create-post action to moderators only', () => {
    expect(config.menu.items).toHaveLength(1);
    const item = config.menu.items[0];
    if (!item) {
      throw new Error('missing menu item');
    }

    expect(item.label).toBe("Create today's Fault Lines post");
    expect(item.description.length).toBeGreaterThan(0);
    expect(item.forUserType).toBe('moderator');
    expect(item.endpoint).toBe('/internal/menu/create-post');
    expect(item.location).toContain('subreddit');
  });
});

describe('declared internal endpoints', () => {
  it('are answered by the server and are idempotent', async () => {
    app = await startTestApp(makeDeps());

    for (const endpoint of internalEndpoints()) {
      const response = await fetch(`${app.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });

      expect(response.status, endpoint).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.ok, endpoint).toBe(true);
      expect(['created', 'exists', 'in_progress']).toContain(body.status);
    }

    expect(app.deps.publisher.publishCount).toBe(1);
  });
});
