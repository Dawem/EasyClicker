import browser from 'webextension-polyfill';
import { ClickItem, Preset, StorageData } from './types';
import { matchPatternToRegExp, getRequiredElement } from './utils';
import { renderList, renderPresets } from './popup_ui';

const addSection = getRequiredElement<HTMLElement>('addSection');
const toggleFormBtn = getRequiredElement<HTMLElement>('toggleFormBtn');
const cancelFormBtn = getRequiredElement<HTMLElement>('cancelFormBtn');
const dashboardView = getRequiredElement<HTMLElement>('dashboardView');

const elementTypeObj = getRequiredElement<HTMLSelectElement>('elementType');
const matchTypeObj = getRequiredElement<HTMLSelectElement>('matchType');
const selectorInput = getRequiredElement<HTMLInputElement>('selector');
const selectorError = getRequiredElement<HTMLElement>('selectorError');
const customNameInput = getRequiredElement<HTMLInputElement>('customName');
const targetTextInput = getRequiredElement<HTMLInputElement>('targetText');
const matchPatternInput = getRequiredElement<HTMLInputElement>('matchPattern');
const itemIntervalInput = getRequiredElement<HTMLInputElement>('itemInterval');
const intervalInput = getRequiredElement<HTMLInputElement>('interval');
const autoStartCheckbox = getRequiredElement<HTMLInputElement>('autoStart');
const addUpdateBtn = getRequiredElement<HTMLButtonElement>('addUpdateBtn');
const editIdInput = getRequiredElement<HTMLInputElement>('editId');
const elementList = getRequiredElement<HTMLElement>('elementList');
const filterDomainCheckbox = getRequiredElement<HTMLInputElement>('filterDomain');
const toggleStartStopBtn = getRequiredElement<HTMLButtonElement>('toggleStartStopBtn');

const runModeSelect = getRequiredElement<HTMLSelectElement>('runMode');
const presetSelect = getRequiredElement<HTMLSelectElement>('presetSelect');
const presetSelectDashboard = getRequiredElement<HTMLSelectElement>('presetSelectDashboard');
const newPresetBtn = getRequiredElement<HTMLButtonElement>('newPresetBtn');
const deletePresetBtn = getRequiredElement<HTMLButtonElement>('deletePresetBtn');
const renamePresetBtn = getRequiredElement<HTMLButtonElement>('renamePresetBtn');
const presetActionsBlock = getRequiredElement<HTMLElement>('presetActionsBlock');

const exportSinglePresetBtn = getRequiredElement<HTMLButtonElement>('exportSinglePresetBtn');
const importSinglePresetBtn = getRequiredElement<HTMLButtonElement>('importSinglePresetBtn');
const exportPresetBtn = getRequiredElement<HTMLButtonElement>('exportPresetBtn');
const importPresetBtn = getRequiredElement<HTMLButtonElement>('importPresetBtn');

const presetPromptDiv = getRequiredElement<HTMLElement>('presetPromptDiv');
const presetNameInput = getRequiredElement<HTMLInputElement>('presetNameInput');
const presetConfirmBtn = getRequiredElement<HTMLButtonElement>('presetConfirmBtn');
const presetCancelBtn = getRequiredElement<HTMLButtonElement>('presetCancelBtn');

const settingsBtn = getRequiredElement<HTMLButtonElement>('settingsBtn');
const settingsView = getRequiredElement<HTMLElement>('settingsView');
const mainView = getRequiredElement<HTMLElement>('mainView');
const settingsBackBtn = getRequiredElement<HTMLButtonElement>('settingsBackBtn');
const pickBtn = getRequiredElement<HTMLButtonElement>('pickBtn');

let items: ClickItem[] = [];
let presets: Preset[] = [];
let currentPresetId = 'default';
let defaultMatchPattern = '';
let currentTabUrl = '';
let isRenaming = false;
let rafId: number | null = null;
let globalIsRunning = false;
let globalInterval = 1.5;
let globalStartTime = 0;
let runMode: 'sequence' | 'parallel' = 'sequence';
let activeSequenceItemId: string | null = null;
let activeSequenceItemStart = 0;

function toggleSelectorPlaceholder() {
  if (elementTypeObj.value === 'any') {
    selectorInput.placeholder = "e.g. .buy-btn or [name='submit']";
  } else {
    selectorInput.placeholder = "Optional: .classname or #id";
  }
}

function updateProgressBars() {
  if (!globalIsRunning) return;
  const now = Date.now();
  const els = document.querySelectorAll('.element-item');
  els.forEach((el) => {
    const bar = el.querySelector('.progress-bar') as HTMLElement;
    if (!bar) return;
    const isEnabled = (el.querySelector('.item-checkbox') as HTMLInputElement).checked;

    if (!isEnabled) {
      bar.style.width = '0%';
      bar.classList.remove('fast-mode');
      return;
    }

    if (runMode === 'sequence') {
      const itemId = (el as HTMLElement).dataset.itemId;
      if (itemId === activeSequenceItemId) {
        const val = (el as HTMLElement).dataset.intervalMs;
        const itemIntervalMs = val ? parseFloat(val) : globalInterval * 1000;
        const elapsed = now - activeSequenceItemStart;
        const progress = Math.min(1, Math.max(0, elapsed / itemIntervalMs));
        bar.style.width = `${progress * 100}%`;
        bar.style.opacity = '1';
        if (bar.classList.contains('fast-mode')) bar.classList.remove('fast-mode');
      } else {
        bar.style.width = '0%';
      }
    } else {
      const val = (el as HTMLElement).dataset.intervalMs;
      const itemIntervalMs = val ? parseFloat(val) : globalInterval * 1000;
      if (itemIntervalMs < 100) {
        if (!bar.classList.contains('fast-mode')) bar.classList.add('fast-mode');
      } else {
        if (bar.classList.contains('fast-mode')) bar.classList.remove('fast-mode');
        const elapsed = now - globalStartTime;
        if (elapsed < 0) return;
        const progress = (elapsed % itemIntervalMs) / itemIntervalMs;
        bar.style.width = `${progress * 100}%`;
      }
    }
  });
  rafId = requestAnimationFrame(updateProgressBars);
}

function openForm() {
  settingsView.style.display = 'none';
  settingsBtn.style.background = 'var(--surface-color)';
  settingsBtn.style.color = 'var(--text-main)';
  mainView.style.display = 'flex';
  addSection.style.display = 'block';
  toggleFormBtn.style.display = 'none';
  dashboardView.style.display = 'none';
  settingsBtn.style.display = 'none';
}

function closeForm() {
  addSection.style.display = 'none';
  toggleFormBtn.style.display = 'flex';
  dashboardView.style.display = 'flex';
  settingsBtn.style.display = 'flex';
  editIdInput.value = '';
  addUpdateBtn.textContent = 'Add Element';
  addUpdateBtn.classList.remove('edit-mode');
  selectorInput.value = '';
  customNameInput.value = '';
  targetTextInput.value = '';
  matchPatternInput.value = defaultMatchPattern;
  itemIntervalInput.value = '';
  elementTypeObj.value = 'any';
  matchTypeObj.value = 'first';
  toggleSelectorPlaceholder();
  selectorError.style.display = 'none';
}

function saveItems() {
  browser.storage.local.set({ items });
}

function syncList() {
  renderList(elementList, items, globalInterval, filterDomainCheckbox.checked, currentTabUrl, {
    onToggle: (id, enabled) => {
      const item = items.find(i => i.id === id);
      if (item) item.enabled = enabled;
      saveItems();
    },
    onEdit: (item) => {
      openForm();
      elementTypeObj.value = item.type || 'any';
      matchTypeObj.value = item.matchType || 'first';
      selectorInput.value = item.selector || '';
      customNameInput.value = item.customName || '';
      targetTextInput.value = item.targetText || '';
      matchPatternInput.value = item.matchPattern || '';
      itemIntervalInput.value = item.interval || '';
      editIdInput.value = item.id;
      addUpdateBtn.textContent = 'Update Element';
      addUpdateBtn.classList.add('edit-mode');
      selectorError.style.display = 'none';
      toggleSelectorPlaceholder();
    },
    onCopy: (item) => {
      const newItem = JSON.parse(JSON.stringify(item));
      newItem.id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
      const index = items.findIndex((i) => i.id === item.id);
      if (index > -1) items.splice(index + 1, 0, newItem);
      else items.push(newItem);
      saveItems();
      syncList();
    },
    onDelete: (id) => {
      items = items.filter((i) => i.id !== id);
      if (editIdInput.value === id) closeForm();
      saveItems();
      syncList();
    }
  });
}

// Drag & Drop
let dragSourceEl: HTMLElement | null = null;
elementList.addEventListener('dragstart', (e: DragEvent) => {
  const itemEl = (e.target as HTMLElement).closest('.element-item') as HTMLElement;
  if (!itemEl || !e.dataTransfer) return;
  dragSourceEl = itemEl;
  e.dataTransfer.effectAllowed = 'move';
  const itemId = dragSourceEl.dataset.itemId;
  if (itemId) e.dataTransfer.setData('text/plain', itemId);
  setTimeout(() => (itemEl.style.opacity = '0.4'), 0);
});

elementList.addEventListener('dragover', (e: DragEvent) => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  const targetEl = (e.target as HTMLElement).closest('.element-item') as HTMLElement;
  if (targetEl && targetEl !== dragSourceEl) {
    const rect = targetEl.getBoundingClientRect();
    const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
    if (next) {
      targetEl.style.borderBottom = '2px solid var(--accent-primary)';
      targetEl.style.borderTop = '';
    } else {
      targetEl.style.borderTop = '2px solid var(--accent-primary)';
      targetEl.style.borderBottom = '';
    }
  }
});

elementList.addEventListener('dragleave', (e: DragEvent) => {
  const targetEl = (e.target as HTMLElement).closest('.element-item') as HTMLElement;
  if (targetEl) {
    targetEl.style.borderTop = '';
    targetEl.style.borderBottom = '1px solid var(--border-color)';
  }
});

elementList.addEventListener('dragend', () => {
  const els = elementList.querySelectorAll('.element-item');
  els.forEach((el) => {
    (el as HTMLElement).style.opacity = '1';
    (el as HTMLElement).style.borderTop = '';
    (el as HTMLElement).style.borderBottom = '1px solid var(--border-color)';
  });
});

elementList.addEventListener('drop', (e: DragEvent) => {
  e.stopPropagation();
  if (dragSourceEl) {
    const targetEl = (e.target as HTMLElement).closest('.element-item') as HTMLElement;
    if (targetEl && targetEl !== dragSourceEl) {
      const rect = targetEl.getBoundingClientRect();
      const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
      
      const sourceId = dragSourceEl.dataset.itemId;
      const targetId = targetEl.dataset.itemId;
      
      const sourceIndex = items.findIndex(i => i.id === sourceId);
      const targetIndex = items.findIndex(i => i.id === targetId);
      
      if (sourceIndex > -1 && targetIndex > -1) {
        const [removed] = items.splice(sourceIndex, 1);
        const newIndex = next ? targetIndex : (targetIndex > sourceIndex ? targetIndex - 1 : targetIndex);
        items.splice(newIndex, 0, removed);
        saveItems();
        syncList();
      }
    }
  }
  return false;
});

// Event Listeners
settingsBtn.addEventListener('click', () => {
  const isOpening = settingsView.style.display === 'none';
  settingsView.style.display = isOpening ? 'flex' : 'none';
  mainView.style.display = isOpening ? 'none' : 'flex';
});

settingsBackBtn.addEventListener('click', () => {
  settingsView.style.display = 'none';
  mainView.style.display = 'flex';
});

toggleFormBtn.addEventListener('click', openForm);
cancelFormBtn.addEventListener('click', closeForm);
elementTypeObj.addEventListener('change', toggleSelectorPlaceholder);

pickBtn.addEventListener('click', () => {
  browser.storage.local.set({
    draftItem: {
      type: elementTypeObj.value,
      matchType: matchTypeObj.value,
      customName: customNameInput.value,
      targetText: targetTextInput.value,
      matchPattern: matchPatternInput.value,
      interval: itemIntervalInput.value,
      editId: editIdInput.value,
    },
  }).then(() => {
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs.length > 0 && tabs[0].id !== undefined) {
        browser.tabs.sendMessage(tabs[0].id, { action: 'startPicking' }).catch(() => {});
      }
      window.close();
    });
  });
});

addUpdateBtn.addEventListener('click', () => {
  const type = elementTypeObj.value;
  const selector = selectorInput.value.trim();
  const matchType = matchTypeObj.value as 'first' | 'all';
  const customName = customNameInput.value.trim();
  const targetText = targetTextInput.value.trim();
  const matchPattern = matchPatternInput.value.trim();
  const interval = itemIntervalInput.value.trim();
  const editId = editIdInput.value;

  if (type === 'any' && !selector) {
    selectorError.style.display = 'block';
    return;
  }

  if (editId) {
    const item = items.find((i) => i.id === editId);
    if (item) {
      Object.assign(item, { type, selector, matchType, customName, targetText, matchPattern, interval });
    }
  } else {
    items.push({
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      type, selector, matchType, customName, targetText, matchPattern, interval,
      enabled: true,
    });
  }

  saveItems();
  closeForm();
  syncList();
});

filterDomainCheckbox.addEventListener('change', syncList);

toggleStartStopBtn.addEventListener('click', () => {
  browser.runtime.sendMessage({ action: globalIsRunning ? 'stop' : 'start' });
});

intervalInput.addEventListener('change', () => {
  const val = parseFloat(intervalInput.value);
  if (!isNaN(val) && val >= 0.1) {
    browser.storage.local.set({ interval: val });
  }
});

autoStartCheckbox.addEventListener('change', () => {
  browser.storage.local.set({ autoStart: autoStartCheckbox.checked });
});

runModeSelect.addEventListener('change', () => {
  browser.storage.local.set({ runMode: runModeSelect.value as 'sequence' | 'parallel' });
});

// Presets Logic
newPresetBtn.addEventListener('click', () => {
  isRenaming = false;
  presetNameInput.value = '';
  presetPromptDiv.style.display = 'flex';
  presetActionsBlock.style.display = 'none';
  presetNameInput.focus();
});

renamePresetBtn.addEventListener('click', () => {
  if (currentPresetId === 'default') return;
  const p = presets.find(x => x.id === currentPresetId);
  if (!p) return;
  isRenaming = true;
  presetNameInput.value = p.name;
  presetPromptDiv.style.display = 'flex';
  presetActionsBlock.style.display = 'none';
  presetNameInput.focus();
});

presetCancelBtn.addEventListener('click', () => {
  presetPromptDiv.style.display = 'none';
  if (currentPresetId !== 'default') presetActionsBlock.style.display = 'flex';
});

presetConfirmBtn.addEventListener('click', () => {
  const name = presetNameInput.value.trim();
  if (!name) return;

  if (isRenaming) {
    const p = presets.find(x => x.id === currentPresetId);
    if (p) p.name = name;
  } else {
    presets.push({
      id: Date.now().toString(),
      name,
      items: JSON.parse(JSON.stringify(items)),
      runMode: runModeSelect.value as 'sequence' | 'parallel'
    });
  }
  browser.storage.local.set({ presets });
  presetPromptDiv.style.display = 'none';
});

deletePresetBtn.addEventListener('click', () => {
  if (currentPresetId === 'default') return;
  presets = presets.filter(p => p.id !== currentPresetId);
  browser.storage.local.set({ presets, currentPresetId: 'default' });
});

function exportPresets() {
  const data = JSON.stringify({ items, presets, interval: globalInterval, runMode }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `easy-clicker-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}

exportPresetBtn.addEventListener('click', exportPresets);

importPresetBtn.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (re) => {
        try {
          const data = JSON.parse(re.target?.result as string);
          if (data.items) browser.storage.local.set({ items: data.items });
          if (data.presets) browser.storage.local.set({ presets: data.presets });
          if (data.interval) browser.storage.local.set({ interval: data.interval });
          if (data.runMode) browser.storage.local.set({ runMode: data.runMode });
          alert('Backup imported successfully!');
        } catch (_err) {
          alert('Invalid backup file.');
        }
      };
      reader.readAsText(file);
    }
  };
  input.click();
});

// Initialization
async function init() {
  const data = (await browser.storage.local.get(null)) as unknown as StorageData;
  items = data.items || [];
  presets = data.presets || [];
  currentPresetId = data.currentPresetId || 'default';
  globalIsRunning = !!data.isRunning;
  globalInterval = data.interval || 1.5;
  globalStartTime = data.startTime || 0;
  runMode = data.runMode || 'sequence';
  activeSequenceItemId = data.activeSequenceItemId || null;
  activeSequenceItemStart = data.activeSequenceItemStart || 0;

  intervalInput.value = globalInterval.toString();
  autoStartCheckbox.checked = !!data.autoStart;
  runModeSelect.value = runMode;

  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs.length > 0 && tabs[0].url) {
    currentTabUrl = tabs[0].url;
    try {
      const url = new URL(tabs[0].url);
      const parts = url.hostname.split('.');
      if (parts.length > 1) {
         const apex = parts.length > 2 && parts[parts.length-2].length <= 3 ? parts.slice(-3).join('.') : parts.slice(-2).join('.');
         defaultMatchPattern = `*://*.${apex}/*`;
      }
    } catch(_e) {}
  }
  
  if (data.draftItem) {
    const d = data.draftItem;
    elementTypeObj.value = d.type || 'any';
    matchTypeObj.value = d.matchType || 'first';
    customNameInput.value = d.customName || '';
    targetTextInput.value = d.targetText || '';
    matchPatternInput.value = d.matchPattern || defaultMatchPattern;
    itemIntervalInput.value = d.interval || '';
    editIdInput.value = d.editId || '';
    if (data.pickedSelector) selectorInput.value = data.pickedSelector;
    openForm();
    if (editIdInput.value) {
      addUpdateBtn.textContent = 'Update Element';
      addUpdateBtn.classList.add('edit-mode');
    }
    browser.storage.local.remove(['draftItem', 'pickedSelector', 'pickedText']);
  } else {
    matchPatternInput.value = defaultMatchPattern;
  }

  syncList();
  renderPresets([presetSelect, presetSelectDashboard], presets, currentPresetId);
  presetActionsBlock.style.display = currentPresetId === 'default' ? 'none' : 'flex';

  if (globalIsRunning) updateProgressBars();
}

browser.storage.onChanged.addListener((changes: Record<string, browser.Storage.StorageChange>) => {
  if (changes.items) {
    items = changes.items.newValue as ClickItem[];
    syncList();
  }
  if (changes.presets) {
    presets = changes.presets.newValue as Preset[];
    renderPresets([presetSelect, presetSelectDashboard], presets, currentPresetId);
  }
  if (changes.currentPresetId) {
    currentPresetId = changes.currentPresetId.newValue as string;
    renderPresets([presetSelect, presetSelectDashboard], presets, currentPresetId);
    presetActionsBlock.style.display = currentPresetId === 'default' ? 'none' : 'flex';
  }
  if (changes.isRunning) {
    globalIsRunning = !!changes.isRunning.newValue;
    if (globalIsRunning) {
      globalStartTime = Date.now();
      updateProgressBars();
    } else if (rafId) {
      cancelAnimationFrame(rafId);
    }
  }
  if (changes.activeSequenceItemId) {
    activeSequenceItemId = changes.activeSequenceItemId.newValue as string | null;
  }
  if (changes.activeSequenceItemStart) {
    activeSequenceItemStart = changes.activeSequenceItemStart.newValue as number;
  }
});

init();
