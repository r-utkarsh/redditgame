/**
 * @file        src/client/ui/resultCard.ts
 * @purpose     Builds the single result card overlay with two stat rows, a marker legend and the share action.
 * @layer       client ui (DOM: documented coverage exclusion)
 * @keyFunctions
 *   - createResultCard(root, onShare): ResultCard
 * @invariants  text only via textContent; one card; no scroll; share fallback is a readonly textarea
 * @security    S9: no HTML string, no innerHTML; S17: share text carries no coordinates
 * @tests       none (DOM glue; rows, copy and share text are tested in tests/client)
 * @spec        06-design-and-ux.md result card; P4-client.md step 8; D-027
 */
import type { ResultView } from '../view/result';
import {
  resultComputerLine,
  resultLegend,
  resultRows,
  resultSubline,
} from '../view/result';
import {
  formatErrorHeadline,
  formatStars,
  formatStarsLabel,
} from '../view/format';
import { element } from './items';

export type ResultCard = {
  show(view: ResultView): void;
  hide(): void;
  setShareStatus(text: string): void;
  showShareText(text: string): void;
};

export function createResultCard(
  root: HTMLElement,
  onShare: () => void
): ResultCard {
  let shareStatus: HTMLElement | null = null;
  let shareFallback: HTMLTextAreaElement | null = null;

  function show(view: ResultView): void {
    const head = element('div', 'result-head');
    const kicker = element('p', 'result-kicker', 'Result');
    const stars = element('p', 'result-stars', formatStars(view.results.you.stars));
    stars.setAttribute('aria-hidden', 'true');
    const starsLabel = element(
      'span',
      'sr-only',
      formatStarsLabel(view.results.you.stars)
    );
    head.append(kicker, stars, starsLabel);

    const headline = element(
      'h2',
      'result-headline',
      formatErrorHeadline(view.results.you.errorKm)
    );
    const subline = element(
      'p',
      'result-subline',
      resultSubline(view.results.you.errorKm)
    );
    const computer = element('p', 'result-computer', resultComputerLine(view));

    const rows = element('div', 'result-rows');
    for (const row of resultRows(view)) {
      const rowNode = element('div', 'result-row');
      for (const cell of row) {
        const cellNode = element('div', 'result-cell');
        cellNode.append(
          element('span', 'result-label', cell.label),
          element('strong', 'result-value', cell.value)
        );
        rowNode.append(cellNode);
      }
      rows.append(rowNode);
    }

    const legend = element('div', 'result-legend');
    for (const item of resultLegend()) {
      const mark = element('span', `legend-mark legend-${item.shape}`);
      mark.setAttribute('aria-hidden', 'true');
      const entry = element('span', 'legend-item');
      entry.append(mark, element('span', 'legend-label', item.label));
      legend.append(entry);
    }

    const share = element('button', 'primary-button result-share', 'Share');
    share.type = 'button';
    share.addEventListener('click', onShare);

    shareStatus = element('p', 'share-status');
    shareStatus.setAttribute('aria-live', 'polite');

    shareFallback = element('textarea', 'share-text');
    shareFallback.readOnly = true;
    shareFallback.rows = 2;
    shareFallback.hidden = true;
    shareFallback.setAttribute('aria-label', 'Share text');

    root.replaceChildren(
      head,
      headline,
      subline,
      computer,
      rows,
      legend,
      share,
      shareFallback,
      shareStatus
    );
    root.hidden = false;
  }

  function hide(): void {
    root.hidden = true;
    root.replaceChildren();
    shareStatus = null;
    shareFallback = null;
  }

  function setShareStatus(text: string): void {
    if (shareStatus) {
      shareStatus.textContent = text;
    }
  }

  function showShareText(text: string): void {
    if (!shareFallback) {
      return;
    }
    shareFallback.hidden = false;
    shareFallback.value = text;
    shareFallback.focus();
    shareFallback.select();
  }

  return { show, hide, setShareStatus, showShareText };
}
