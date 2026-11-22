/**
 * @file        src/client/ui/overlay.ts
 * @purpose     Shows the blocking 503, 429, network and closed card with at most one retry action.
 * @layer       client ui (DOM: documented coverage exclusion)
 * @keyFunctions
 *   - createOverlay(root): Overlay
 * @invariants  one message and at most one button; a closed card has no retry; focus moves into the card
 * @security    S9, S10: textContent only, generic copy, no error internals
 * @tests       none (DOM glue; copy and retry timing are exercised in the game flow)
 * @spec        06-design-and-ux.md error states; P4-client.md step 8; D-027
 */
import { element } from './items';

export type OverlayOptions = {
  title?: string;
  message: string;
  retryLabel?: string;
  retryDisabled?: boolean;
  onRetry?: () => void;
};

export type Overlay = {
  show(options: OverlayOptions): void;
  setMessage(text: string): void;
  setRetryEnabled(enabled: boolean): void;
  hide(): void;
};

export function createOverlay(root: HTMLElement): Overlay {
  let messageNode: HTMLElement | null = null;
  let retryButton: HTMLButtonElement | null = null;

  function show(options: OverlayOptions): void {
    const card = element('section', 'overlay-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'overlay-title');
    card.tabIndex = -1;

    const title = element('h2', 'overlay-title', options.title ?? 'Hmm.');
    title.id = 'overlay-title';
    messageNode = element('p', 'overlay-message', options.message);
    messageNode.id = 'overlay-message';

    const children = [title, messageNode];
    retryButton = null;

    if (options.retryLabel) {
      retryButton = element('button', 'primary-button', options.retryLabel);
      retryButton.type = 'button';
      retryButton.disabled = options.retryDisabled === true;
      retryButton.addEventListener('click', () => {
        options.onRetry?.();
      });
      children.push(retryButton);
    }

    card.append(...children);
    root.replaceChildren(card);
    root.hidden = false;

    if (retryButton && !retryButton.disabled) {
      retryButton.focus();
    } else {
      card.focus();
    }
  }

  function setMessage(text: string): void {
    if (messageNode) {
      messageNode.textContent = text;
    }
  }

  function setRetryEnabled(enabled: boolean): void {
    if (retryButton) {
      retryButton.disabled = !enabled;
      if (enabled) {
        retryButton.focus();
      }
    }
  }

  function hide(): void {
    root.hidden = true;
    root.replaceChildren();
    messageNode = null;
    retryButton = null;
  }

  return { show, setMessage, setRetryEnabled, hide };
}
