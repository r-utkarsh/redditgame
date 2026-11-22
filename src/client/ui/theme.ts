/**
 * @file        src/client/ui/theme.ts
 * @purpose     Applies the theme tokens to the document as CSS custom properties at boot.
 * @layer       client ui (DOM: documented coverage exclusion)
 * @keyFunctions
 *   - applyTheme(root?): void
 * @invariants  every CSS variable comes from theme.ts; applying twice is harmless
 * @security    S9: CSS variables only, no inline style attribute in HTML and no HTML string
 * @tests       none (DOM glue; theme tokens are tested in tests/client/theme.test.ts)
 * @spec        06-design-and-ux.md look and feel; P4-client.md step 1
 */
import {
  COLORS,
  FONTS,
  RADIUS_PX,
  SPACE_PX,
  TYPE_PX,
} from '../theme';

function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function applyTheme(root: HTMLElement = document.documentElement): void {
  const styles = root.style;

  for (const [key, value] of Object.entries(COLORS)) {
    styles.setProperty(`--fl-color-${kebab(key)}`, value);
  }
  for (const [key, value] of Object.entries(TYPE_PX)) {
    styles.setProperty(`--fl-type-${kebab(key)}`, `${value}px`);
  }
  for (const [key, value] of Object.entries(SPACE_PX)) {
    styles.setProperty(`--fl-space-${kebab(key)}`, `${value}px`);
  }
  for (const [key, value] of Object.entries(RADIUS_PX)) {
    styles.setProperty(`--fl-radius-${kebab(key)}`, `${value}px`);
  }

  styles.setProperty('--fl-font-body', FONTS.body);
  styles.setProperty('--fl-font-mono', FONTS.mono);
}
