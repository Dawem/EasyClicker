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

browser.runtime.onMessage.addListener((message: any) => {
  if (message.action === 'start' || message.action === 'stop') {
    toggleClickerState(message.action as 'start' | 'stop');
  }
});
