/**
 * @file        tests/meta/clientCsp.test.ts
 * @purpose     Proves the built splash and game documents are CSP-safe: linked bundled CSS, no inline style or script, no external assets.
 * @covers      dist/client/splash.html, dist/client/game.html, src/client/index.css
 * @spec        04-security.md S9; P4-client.md step 9; D-006
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BUILT = join(ROOT, 'dist', 'client');
const PAGES = ['splash.html', 'game.html'];

async function ensureBuilt(): Promise<void> {
  if (PAGES.every((page) => existsSync(join(BUILT, page)))) {
    return;
  }

  await build({ configFile: join(ROOT, 'vite.config.ts'), logLevel: 'silent' });
}

function page(name: string): string {
  return readFileSync(join(BUILT, name), 'utf8');
}

describe('built client CSP safety', () => {
  it.each(PAGES)('%s carries the locked CSP meta tag', async (name) => {
    await ensureBuilt();
    const html = page(name);

    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("default-src 'self'");
    expect(html).toContain("style-src 'self'");
    expect(html).not.toContain("unsafe-inline");
    expect(html).not.toContain("unsafe-eval");
  });

  it.each(PAGES)('%s links bundled CSS and never inlines style', async (name) => {
    await ensureBuilt();
    const html = page(name);
    const hrefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)];

    expect(html).not.toMatch(/<style[\s>]/i);
    expect(html).not.toMatch(/\sstyle\s*=/i);
    expect(hrefs.length).toBeGreaterThan(0);

    for (const [, href] of hrefs) {
      const relative = href!.replace(/^\.?\//, '');
      const file = join(BUILT, relative);
      expect(existsSync(file)).toBe(true);
      const css = readFileSync(file, 'utf8');
      expect(css).toContain('var(--fl-');
      expect(css).not.toContain('@import url(http');
      expect(css).not.toContain('url(http');
    }
  });

  it.each(PAGES)('%s loads only bundled module scripts', async (name) => {
    await ensureBuilt();
    const html = page(name);
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];

    expect(scripts.length).toBeGreaterThan(0);
    for (const [, attributes, body] of scripts) {
      expect(attributes).toContain('type="module"');
      expect(attributes).toContain('src="');
      expect(body!.trim()).toBe('');
    }
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it.each(PAGES)('%s references no external asset host', async (name) => {
    await ensureBuilt();
    const html = page(name);
    const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(
      (match) => match[1]!
    );

    for (const url of urls) {
      expect(url).not.toMatch(/^(https?:)?\/\//i);
    }
  });

  it('ships the theme variables from JS rather than inline HTML', async () => {
    await ensureBuilt();
    const html = page('game.html');

    expect(html).not.toContain('--fl-');
    expect(html).toContain('id="map-canvas"');
  });
});
