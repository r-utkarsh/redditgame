/**
 * @file        src/client/ui/items.ts
 * @purpose     Small DOM builders for text-only labels, station chips and live status messages.
 * @layer       client ui (DOM: documented coverage exclusion)
 * @keyFunctions
 *   - element(tag, className?, text?): HTMLElement
 *   - renderStationChips(container, stations): void
 *   - setStatus(node, text): void
 * @invariants  text only via textContent; containers are cleared with replaceChildren
 * @security    S9: no innerHTML or other HTML sinks
 * @tests       none (DOM glue; chip copy is tested in tests/client/viewChips.test.ts)
 * @spec        06-design-and-ux.md accessibility; P4-client.md step 6
 */
import { stationChips } from '../view/chips';
import type { Station } from '../../shared/types';

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

export function renderStationChips(
  container: HTMLElement,
  stations: readonly Station[]
): void {
  const chips = stationChips(stations).map((chip) => {
    const wrapper = element('div', 'chip');
    wrapper.append(
      element('span', 'chip-label', chip.label),
      element('span', 'chip-delay', chip.delay),
      element('span', 'chip-distance', chip.distance)
    );
    return wrapper;
  });

  container.replaceChildren(...chips);
}

export function setStatus(node: HTMLElement, text: string): void {
  node.textContent = text;
}
