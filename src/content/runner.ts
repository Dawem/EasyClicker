import browser from 'webextension-polyfill';
import { state } from './state';
import { matchPatternToRegExp } from '../utils';
import { ClickItem, StorageData } from '../types';

export function clickElement(item: ClickItem): void {
  const finalSelector = item.type === 'any' ? item.selector : item.type + (item.selector || '');
  if (!finalSelector) return;

  let elements;
  try {
    elements = Array.from(document.querySelectorAll(finalSelector));
  } catch (_e) {
    return;
  }

  if (item.targetText) {
    const searchTarget = item.targetText.toLowerCase().trim().replace(/\s+/g, ' ');
    elements = elements.filter((el) => {
      const innerText = ((el as HTMLElement).innerText || '').toLowerCase().replace(/\s+/g, ' ');
      const textContent = (el.textContent || '').toLowerCase().replace(/\s+/g, ' ');
      return innerText.includes(searchTarget) || textContent.includes(searchTarget);
    });
  }

  if (elements.length === 0) return;

  const matchType = item.matchType || 'first';

  if (matchType === 'first') {
    (elements[0] as HTMLElement).click();
  } else if (matchType === 'last') {
    (elements[elements.length - 1] as HTMLElement).click();
  } else if (matchType === 'all') {
    elements.forEach((el) => (el as HTMLElement).click());
  }
}

export function canProcessItem(item: ClickItem): boolean {
  if (!item.matchPattern) return true;
  try {
    const regex = matchPatternToRegExp(item.matchPattern);
    return regex.test(window.location.href);
  } catch (_e) {
    return false;
  }
}

export function processItem(item: ClickItem): void {
  if (canProcessItem(item)) {
    clickElement(item);
  }
}

export function startClicker() {
  stopClicker();
  state.isRunning = true;
  state.sequenceStopFlag = false;
  state.sequenceId++;
  const mySequenceId = state.sequenceId;

  browser.storage.local.get(['items', 'interval', 'runMode']).then(async (res: Partial<StorageData>) => {
    if (mySequenceId !== state.sequenceId) return;

    const items = (res.items || []) as ClickItem[];
    const globalIntervalMs = (parseFloat(res.interval || '1.5') || 1.5) * 1000;
    const runMode = res.runMode || 'sequence';
    state.currentRunMode = runMode;

    if (runMode === 'parallel') {
      items.forEach((item) => {
        if (item.enabled) {
          const itemIntervalMs =
            item.interval && !isNaN(parseFloat(item.interval)) ? parseFloat(item.interval) * 1000 : globalIntervalMs;

          const id = window.setInterval(() => processItem(item), itemIntervalMs);
          state.itemIntervalIds.push(id);
        }
      });
    } else {
      while (state.isRunning && !state.sequenceStopFlag && mySequenceId === state.sequenceId) {
        let processedAny = false;
        for (let i = 0; i < items.length; i++) {
          if (!state.isRunning || state.sequenceStopFlag || mySequenceId !== state.sequenceId) break;
          const item = items[i];
          if (item.enabled && canProcessItem(item)) {
            clickElement(item);
            processedAny = true;
            const itemIntervalMs =
              item.interval && !isNaN(parseFloat(item.interval)) ? parseFloat(item.interval) * 1000 : globalIntervalMs;

            browser.storage.local.set({ activeSequenceItemId: item.id, activeSequenceItemStart: Date.now() });

            await new Promise<void>((resolve) => {
              state.currentSequenceResolve = resolve;
              state.currentSequenceTimer = window.setTimeout(resolve, itemIntervalMs);
            });
            if (state.currentSequenceResolve) state.currentSequenceResolve = null;
          }
        }
        if (!processedAny) {
          await new Promise<void>((resolve) => {
            state.currentSequenceResolve = resolve;
            state.currentSequenceTimer = window.setTimeout(resolve, 1000);
          });
          if (state.currentSequenceResolve) state.currentSequenceResolve = null;
        }
      }
    }
  });
}

export function stopClicker() {
  state.isRunning = false;
  state.sequenceStopFlag = true;
  state.sequenceId++;
  if (state.currentSequenceTimer) {
    clearTimeout(state.currentSequenceTimer);
    state.currentSequenceTimer = null;
  }
  if (state.currentSequenceResolve) {
    state.currentSequenceResolve();
    state.currentSequenceResolve = null;
  }
  state.itemIntervalIds.forEach((id) => clearInterval(id));
  state.itemIntervalIds = [];
  browser.storage.local.set({ activeSequenceItemId: null });
}
