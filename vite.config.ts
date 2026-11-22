/**
 * @file        vite.config.ts
 * @purpose     Builds the two client documents and the CommonJS server bundle through the Devvit Vite plugin.
 * @layer       build configuration
 * @keyFunctions
 *   - stripSourcemaps: Plugin (drops .map assets so bundled dependency sources never ship)
 *   - default config: client entrypoints from devvit.json and the server bundle
 * @security    S15: the built client carries no dependency source maps that mention /internal/
 * @spec        02-architecture-and-headers.md section 3; D-011; D-013
 * @tests       tests/meta/clientBundle.test.ts; tests/meta/clientCsp.test.ts
 */
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import tailwind from '@tailwindcss/vite';
import { devvit } from '@devvit/start/vite';

const stripSourcemaps: Plugin = {
  name: 'fault-lines-strip-sourcemaps',
  apply: 'build',
  enforce: 'post',
  generateBundle(_options, bundle) {
    for (const fileName of Object.keys(bundle)) {
      if (fileName.endsWith('.map')) {
        delete bundle[fileName];
      }
    }
  },
};

export default defineConfig({
  plugins: [tailwind(), devvit(), stripSourcemaps],
  environments: {
    client: {
      build: { sourcemap: false },
    },
    server: {
      build: { sourcemap: false },
    },
  },
});
