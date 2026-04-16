import browser from 'webextension-polyfill';
import { ClickItem, Preset, StorageData } from './types';
import { matchPatternToRegExp } from './utils';
import { startPicking } from './picker';
import { startClicker, stopClicker, getExecutionState } from './executor';
import { updateOverlay, toggleOverlay, updateProgressBars, setOverlayCoords } from './overlay';

let currentItems: ClickItem[] = [];
let currentPresets: Preset[] = [];
let currentPresetId = 'default';
let isRunning = false;
let globalInterval = 1.0;
let runMode: 'sequence' | 'parallel' = 'sequence';
let rafId: number | null = null;

function canProcessItem(item: ClickItem): boolean {
  if (!item.matchPattern) return true;
  try {
    const regex = matchPatternToRegExp(item.matchPattern);
    return regex.test(window.location.href);
  } catch (_e) {
    return false;
  }
}

function processProgressBars() {
  const state = getExecutionState();
  updateProgressBars(
    state.isRunning,
    state.currentRunMode,
    state.activeSequenceItemId,
    state.activeSequenceItemStart,
    state.globalStartTime,
    state.globalInterval
  );
  rafId = requestAnimationFrame(processProgressBars);
}

async function init() {
  const data = (await browser.storage.local.get(null)) as unknown as StorageData;
  currentItems = data.items || [];
  currentPresets = data.presets || [];
  currentPresetId = data.currentPresetId || 'default';
  isRunning = !!data.isRunning;
  globalInterval = data.interval || 1.0;
  runMode = data.runMode || 'sequence';

  if (data.overlayPosX !== undefined) setOverlayCoords(data.overlayPosX, data.overlayPosY || 20);

  const hostname = window.location.hostname;
  const overlayDomains = data.overlayDomains || {};
  const isOverlayEnabled = overlayDomains[hostname] !== false;

  toggleOverlay(isOverlayEnabled);
  if (isOverlayEnabled) {
    updateOverlay(currentItems, currentPresets, currentPresetId, isRunning, globalInterval, canProcessItem);
  }

  if (isRunning) {
    startClicker(currentItems, runMode, globalInterval);
  }
  
  if (rafId) cancelAnimationFrame(rafId);
  processProgressBars();
}

browser.storage.onChanged.addListener((changes: Record<string, browser.Storage.StorageChange>) => {
  let needsOverlayUpdate = false;
  let needsRestart = false;

  if (changes.items) {
    currentItems = changes.items.newValue as ClickItem[];
    needsOverlayUpdate = true;
    if (isRunning) needsRestart = true;
  }
  if (changes.presets) {
    currentPresets = changes.presets.newValue as Preset[];
    needsOverlayUpdate = true;
  }
  if (changes.currentPresetId) {
    currentPresetId = changes.currentPresetId.newValue as string;
    needsOverlayUpdate = true;
  }
  if (changes.isRunning) {
    isRunning = !!changes.isRunning.newValue;
    if (isRunning) needsRestart = true;
    else stopClicker();
    needsOverlayUpdate = true;
  }
  if (changes.interval) {
    globalInterval = changes.interval.newValue as number;
    needsOverlayUpdate = true;
    if (isRunning) needsRestart = true;
  }
  if (changes.runMode) {
    runMode = changes.runMode.newValue as 'sequence' | 'parallel';
    needsOverlayUpdate = true;
    if (isRunning) needsRestart = true;
  }

  if (changes.overlayDomains) {
    const hostname = window.location.hostname;
    const oldDomains = (changes.overlayDomains.oldValue || {}) as Record<string, boolean>;
    const newDomains = (changes.overlayDomains.newValue || {}) as Record<string, boolean>;
    const oldVal = oldDomains[hostname] !== false;
    const newVal = newDomains[hostname] !== false;
    if (oldVal !== newVal) {
      toggleOverlay(newVal);
      needsOverlayUpdate = newVal;
    }
  }

  if (needsRestart && isRunning) {
    startClicker(currentItems, runMode, globalInterval);
  }

  if (needsOverlayUpdate) {
    updateOverlay(currentItems, currentPresets, currentPresetId, isRunning, globalInterval, canProcessItem);
  }
});

browser.runtime.onMessage.addListener((message: any) => {
  if (message.action === 'startPicker') {
    startPicking();
  }
});

init();
