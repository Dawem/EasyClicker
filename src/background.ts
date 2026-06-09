import browser from 'webextension-polyfill';
import { StorageData } from './types';

function toggleClickerState(action: 'start' | 'stop') {
  const updates: Partial<StorageData> = { isRunning: action === 'start' };
  if (action === 'start') updates.startTime = Date.now();
  browser.storage.local.set(updates);
}

browser.commands.onCommand.addListener((command: string) => {
  if (command === 'start-clicking' || command === 'stop-clicking') {
    toggleClickerState(command === 'start-clicking' ? 'start' : 'stop');
  }
});

browser.runtime.onMessage.addListener((message: unknown) => {
  const msg = message as { action: string };
  if (msg.action === 'start' || msg.action === 'stop') {
    toggleClickerState(msg.action as 'start' | 'stop');
  }
});

browser.storage.onChanged.addListener((changes: Record<string, { newValue?: unknown; oldValue?: unknown }>) => {
  if (changes.isRunning !== undefined) {
    const isRunning = changes.isRunning.newValue as boolean;
    try {
      browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        if (tabs.length > 0 && tabs[0].id !== undefined) {
          browser.tabs.update(tabs[0].id, { autoDiscardable: !isRunning }).catch(() => {});
        }
      });
    } catch (_e) {}
  }
});
