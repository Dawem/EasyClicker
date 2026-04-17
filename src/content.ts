import browser from 'webextension-polyfill';
import { ClickItem, Preset, StorageData } from './types';
import { state } from './content/state';
import { startPicker } from './content/picker';
import { canProcessItem, startClicker, stopClicker } from './content/runner';
import { updatePageOverlay } from './content/overlay';

browser.storage.onChanged.addListener((changes: Record<string, { newValue?: unknown; oldValue?: unknown }>) => {
  let needsOverlayUpdate = false;

  if (changes.interval && changes.interval.newValue) {
    state.globalInterval = parseFloat(changes.interval.newValue as string) || 1.5;
  }
  if (changes.startTime && changes.startTime.newValue) {
    state.globalStartTime = changes.startTime.newValue as number;
  }

  if (changes.runMode && changes.runMode.newValue) {
    state.currentRunMode = changes.runMode.newValue as string;
  }
  if (changes.activeSequenceItemId) {
    state.activeSequenceItemId = (changes.activeSequenceItemId.newValue as string | null) ?? null;
  }
  if (changes.activeSequenceItemStart) {
    state.activeSequenceItemStart = changes.activeSequenceItemStart.newValue as number;
  }

  if (changes.items) {
    state.currentOverlayItems = (changes.items.newValue as ClickItem[]) || [];
    needsOverlayUpdate = true;
  }

  if (changes.presets) {
    state.overlayPresets = (changes.presets.newValue as Preset[]) || [];
    needsOverlayUpdate = true;
  }

  if (changes.currentPresetId) {
    state.overlayCurrentPresetId = (changes.currentPresetId.newValue as string) || 'default';
    needsOverlayUpdate = true;
  }

  if (changes.overlayPositions) {
    state.overlayPositions = (changes.overlayPositions.newValue as Record<string, { x: number; y: number }>) || {};
    const pos = state.overlayPositions[window.location.hostname];
    if (pos) {
      state.overlayPosX = pos.x;
      state.overlayPosY = pos.y;
      if (state.pageOverlayEl) {
        state.pageOverlayEl.style.left = state.overlayPosX + 'px';
        state.pageOverlayEl.style.top = state.overlayPosY + 'px';
      }
    }
  }

  if (changes.overlayDomains) {
    const domains = (changes.overlayDomains.newValue as Record<string, boolean>) || {};
    state.isOverlayVisible = domains[window.location.hostname] === true;
    needsOverlayUpdate = true;
  }

  if (changes.isRunning !== undefined) {
    if (changes.isRunning.newValue) {
      startClicker();
    } else {
      stopClicker();
    }
    needsOverlayUpdate = true;
  } else if (state.isRunning) {
    if (changes.items || changes.interval || changes.runMode) {
      startClicker();
    }
  }

  if (needsOverlayUpdate) {
    updatePageOverlay();
  }
});

browser.runtime.onMessage.addListener((message: unknown) => {
  const msg = message as { action: string };
  if (msg.action === 'startPicking') {
    startPicker();
  }
});

browser.storage.local
  .get([
    'isRunning',
    'autoStart',
    'items',
    'overlayDomains',
    'interval',
    'startTime',
    'runMode',
    'activeSequenceItemId',
    'activeSequenceItemStart',
    'presets',
    'currentPresetId',
    'overlayPositions',
  ])
  .then((res: Partial<StorageData>) => {
    state.currentOverlayItems = (res.items || []) as ClickItem[];
    const domains = res.overlayDomains || {};
    state.isOverlayVisible = domains[window.location.hostname] === true;
    if (res.interval) state.globalInterval = parseFloat(res.interval) || 1.5;
    state.globalStartTime = res.startTime || Date.now();
    state.currentRunMode = res.runMode || 'sequence';
    state.activeSequenceItemId = res.activeSequenceItemId || null;
    state.activeSequenceItemStart = res.activeSequenceItemStart || 0;
    state.overlayPresets = res.presets || [];
    state.overlayCurrentPresetId = res.currentPresetId || 'default';
    state.overlayPositions = res.overlayPositions || {};

    const savedPos = state.overlayPositions[window.location.hostname];
    if (savedPos) {
      state.overlayPosX = savedPos.x;
      state.overlayPosY = savedPos.y;
    }

    if (res.autoStart) {
      const activeItems = (state.currentOverlayItems as ClickItem[]).filter(
        (item) => item.enabled && canProcessItem(item),
      );
      if (activeItems.length > 0) {
        if (!res.isRunning) {
          browser.storage.local.set({ isRunning: true, startTime: Date.now() });
        } else {
          startClicker();
        }
      } else {
        if (res.isRunning) startClicker();
      }
    } else {
      if (res.isRunning) {
        browser.storage.local.set({ isRunning: false });
      }
    }

    updatePageOverlay();
  });
