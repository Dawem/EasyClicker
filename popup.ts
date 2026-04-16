import browser from 'webextension-polyfill';
import { ClickItem, Preset } from './types';

const addSection = document.getElementById('addSection') as HTMLElement;
const toggleFormBtn = document.getElementById('toggleFormBtn') as HTMLElement;
const cancelFormBtn = document.getElementById('cancelFormBtn') as HTMLElement;

const elementTypeObj = document.getElementById('elementType') as HTMLSelectElement;
const matchTypeObj = document.getElementById('matchType') as HTMLSelectElement;
const selectorInput = document.getElementById('selector') as HTMLInputElement;
const selectorError = document.getElementById('selectorError') as HTMLElement;
const customNameInput = document.getElementById('customName') as HTMLInputElement;
const targetTextInput = document.getElementById('targetText') as HTMLInputElement;
const matchPatternInput = document.getElementById('matchPattern') as HTMLInputElement;
const itemIntervalInput = document.getElementById('itemInterval') as HTMLInputElement;
const intervalInput = document.getElementById('interval') as HTMLInputElement;
const autoStartCheckbox = document.getElementById('autoStart') as HTMLInputElement;
const addUpdateBtn = document.getElementById('addUpdateBtn') as HTMLButtonElement;
const editIdInput = document.getElementById('editId') as HTMLInputElement;
const elementList = document.getElementById('elementList') as HTMLElement;
const filterDomainCheckbox = document.getElementById('filterDomain') as HTMLInputElement;
const toggleStartStopBtn = document.getElementById('toggleStartStopBtn') as HTMLButtonElement;
const openOverlayBtn = document.getElementById('openOverlayBtn') as HTMLButtonElement;

const runModeSelect = document.getElementById('runMode') as HTMLSelectElement;
const presetSelect = document.getElementById('presetSelect') as HTMLSelectElement;
const presetSelectDashboard = document.getElementById('presetSelectDashboard') as HTMLSelectElement;
const newPresetBtn = document.getElementById('newPresetBtn') as HTMLButtonElement;
const deletePresetBtn = document.getElementById('deletePresetBtn') as HTMLButtonElement;
const renamePresetBtn = document.getElementById('renamePresetBtn') as HTMLButtonElement;
const presetActionsBlock = document.getElementById('presetActionsBlock') as HTMLElement;

const exportSinglePresetBtn = document.getElementById('exportSinglePresetBtn') as HTMLButtonElement;
const importSinglePresetBtn = document.getElementById('importSinglePresetBtn') as HTMLButtonElement;

const exportPresetBtn = document.getElementById('exportPresetBtn') as HTMLButtonElement;
const importPresetBtn = document.getElementById('importPresetBtn') as HTMLButtonElement;

const presetPromptDiv = document.getElementById('presetPromptDiv') as HTMLElement;
const presetNameInput = document.getElementById('presetNameInput') as HTMLInputElement;
const presetConfirmBtn = document.getElementById('presetConfirmBtn') as HTMLButtonElement;
const presetCancelBtn = document.getElementById('presetCancelBtn') as HTMLButtonElement;

const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
const settingsView = document.getElementById('settingsView') as HTMLElement;
const mainView = document.getElementById('mainView') as HTMLElement;
const settingsBackBtn = document.getElementById('settingsBackBtn') as HTMLButtonElement;

const pickBtn = document.getElementById('pickBtn') as HTMLButtonElement;

let items: ClickItem[] = [];
let defaultMatchPattern = '';
let currentTabUrl = '';
let isRenaming = false;

let presets: Preset[] = [];
let currentPresetId = 'default';

let rafId: number | null = null;
let globalIsRunning = false;
let globalInterval = 1.5;
let globalStartTime = 0;
let runMode = 'sequence';

let activeSequenceItemId: string | null = null;
let activeSequenceItemStart = 0;

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
        const itemIntervalMs = (el as HTMLElement).dataset.intervalMs
          ? parseFloat((el as HTMLElement).dataset.intervalMs!)
          : globalInterval * 1000;
        const elapsed = now - activeSequenceItemStart;
        const progress = Math.min(1, Math.max(0, elapsed / itemIntervalMs));
        bar.style.width = `${progress * 100}%`;
        bar.style.opacity = '1';
        if (bar.classList.contains('fast-mode')) bar.classList.remove('fast-mode');
      } else {
        bar.style.width = '0%';
      }
    } else {
      const itemIntervalMs = (el as HTMLElement).dataset.intervalMs
        ? parseFloat((el as HTMLElement).dataset.intervalMs!)
        : globalInterval * 1000;
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

// Synchronizes filtering capability matching pattern testing natively in the frontend menu
function escapeRegexHost(host) {
  return host.replace(/[\\^$+?.()|[\]{}]/g, '\\$&');
}

function matchPatternToRegExp(pattern) {
  if (!pattern || pattern.trim() === '') return /.*/;
  if (pattern === '<all_urls>') {
    return /^(?:http|https|file|ftp):\/\/.*/;
  }

  let regex = '^';
  const parts = pattern.split('://');
  if (parts.length !== 2) return /$.^/;

  const scheme = parts[0];
  const hostAndPath = parts[1];

  if (scheme === '*') {
    regex += '(http|https)://';
  } else {
    regex += escapeRegexHost(scheme) + '://';
  }

  let hostIndex = hostAndPath.indexOf('/');
  if (hostIndex === -1) hostIndex = hostAndPath.length;

  const host = hostAndPath.substring(0, hostIndex);
  let path = hostAndPath.substring(hostIndex);
  if (path === '') path = '/';

  if (host === '*') {
    regex += '[^/]+';
  } else if (host.startsWith('*.')) {
    const mainHost = escapeRegexHost(host.substring(2));
    regex += `(?:[^/]+\.)?${mainHost}`;
  } else {
    regex += escapeRegexHost(host);
  }

  regex += path.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\\\*/g, '.*');

  regex += '$';
  try {
    return new RegExp(regex);
  } catch (_e) {
    return /$.^/;
  }
}

function initTabContext() {
  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    if (tabs.length > 0 && tabs[0].url) {
      currentTabUrl = tabs[0].url;
      try {
        const url = new URL(tabs[0].url);
        if (url.hostname) {
          const parts = url.hostname.split('.');
          let apexDomain = url.hostname;

          if (parts.length > 2) {
            const sld = parts[parts.length - 2];
            // Handle regional TLDs like .co.uk or .com.au
            if (sld.length <= 3) {
              apexDomain = parts.slice(-3).join('.');
            } else {
              apexDomain = parts.slice(-2).join('.');
            }
          }

          defaultMatchPattern = `*://*.${apexDomain}/*`;
          if (!matchPatternInput.value && !editIdInput.value) {
            matchPatternInput.value = defaultMatchPattern;
          }
        }
      } catch (_e) {
        // Not a standard URL, disregard
      }
    }
    // Renders the list again after grabbing the URL gracefully resolving filtering checks
    renderList();
  });
}

const dashboardView = document.getElementById('dashboardView');

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

toggleFormBtn.addEventListener('click', openForm);
cancelFormBtn.addEventListener('click', closeForm);

pickBtn.addEventListener('click', () => {
  browser.storage.local
    .set({
      draftItem: {
        type: elementTypeObj.value,
        matchType: matchTypeObj.value,
        customName: customNameInput.value,
        targetText: targetTextInput.value,
        matchPattern: matchPatternInput.value,
        interval: itemIntervalInput.value,
        editId: editIdInput.value,
      },
    })
    .then(() => {
      browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        if (tabs.length > 0) {
          browser.tabs.sendMessage(tabs[0].id, { action: 'startPicking' }).catch(() => {});
        }
        window.close();
      });
    });
});

function generateConciseTitle(item: ClickItem, fullSel: string): string {
  if (item.targetText) {
    return `Click "${item.targetText.substring(0, 20)}${item.targetText.length > 20 ? '...' : ''}"`;
  }
  let lastNode = fullSel;
  if (lastNode.includes('>')) {
    const parts = lastNode.split('>');
    lastNode = parts[parts.length - 1].trim();
  }
  lastNode = lastNode.replace(/:nth-[a-z-]+\([0-9]+\)/g, '');

  let tagExtracted = 'Element';
  const tagMatch = lastNode.match(/^[a-zA-Z0-9_-]+/);
  if (tagMatch) {
    tagExtracted = tagMatch[0];
    lastNode = lastNode.substring(tagExtracted.length);
    tagExtracted = tagExtracted.charAt(0).toUpperCase() + tagExtracted.slice(1);
  }

  let conciseTitle = '';
  if (lastNode.includes('#')) {
    const idMatch = lastNode.match(/#[a-zA-Z0-9_-]+/);
    if (idMatch) conciseTitle = `${tagExtracted} ${idMatch[0]}`;
  } else if (lastNode.includes('.')) {
    const classMatch = lastNode.match(/\.[a-zA-Z0-9_-]+/);
    if (classMatch) conciseTitle = `${tagExtracted} ${classMatch[0]}`;
  }

  return 'Click ' + (conciseTitle || tagExtracted);
}

function createListItem(item: ClickItem): HTMLElement {
  const el = document.createElement('div');
  el.className = 'element-item';
  el.dataset.itemId = item.id;
  el.draggable = true;

  const dragHandle = document.createElement('div');
  dragHandle.innerHTML = '⋮⋮';
  dragHandle.style.cursor = 'grab';
  dragHandle.style.color = 'var(--text-muted)';
  dragHandle.style.fontSize = '14px';
  dragHandle.style.paddingRight = '4px';
  dragHandle.style.userSelect = 'none';
  el.appendChild(dragHandle);

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'item-checkbox';
  checkbox.checked = item.enabled;
  checkbox.addEventListener('change', () => {
    item.enabled = checkbox.checked;
    saveItems();
  });

  const info = document.createElement('div');
  info.className = 'item-info';

  const selDiv = document.createElement('div');
  selDiv.className = 'item-selector';
  const fullSel = item.type === 'any' ? item.selector : item.type + (item.selector || '');

  selDiv.textContent = item.customName ? item.customName : generateConciseTitle(item, fullSel);
  selDiv.title = fullSel;

  const matchBadge = document.createElement('span');
  matchBadge.className = 'match-badge';
  matchBadge.textContent = item.matchType || 'first';
  selDiv.appendChild(matchBadge);
  info.appendChild(selDiv);

  if (item.interval) {
    const extrasDiv = document.createElement('div');
    extrasDiv.className = 'item-text';

    const extras = [];
    extras.push(`Speed: ${item.interval}s`);

    extrasDiv.textContent = extras.join(' | ');
    info.appendChild(extrasDiv);
  }

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'icon-btn';
  editBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`;
  editBtn.title = 'Edit';
  editBtn.addEventListener('click', () => {
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
  });

  const copyBtn = document.createElement('button');
  copyBtn.className = 'icon-btn';
  copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
  copyBtn.title = 'Duplicate';
  copyBtn.addEventListener('click', () => {
    const newItem = JSON.parse(JSON.stringify(item));
    newItem.id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    const index = items.findIndex((i) => i.id === item.id);
    if (index > -1) {
      items.splice(index + 1, 0, newItem);
    } else {
      items.push(newItem);
    }
    saveItems();
    renderList();
  });

  const removeBtn = document.createElement('button');
  removeBtn.className = 'icon-btn danger';
  removeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  removeBtn.title = 'Remove';
  removeBtn.addEventListener('click', () => {
    items = items.filter((i) => i.id !== item.id);
    if (editIdInput.value === item.id) closeForm();
    saveItems();
    renderList();
  });

  actions.appendChild(editBtn);
  actions.appendChild(copyBtn);
  actions.appendChild(removeBtn);

  el.appendChild(checkbox);
  el.appendChild(info);
  el.appendChild(actions);

  const pbContainer = document.createElement('div');
  pbContainer.className = 'progress-bar-container';
  const pb = document.createElement('div');
  pb.className = 'progress-bar';
  pbContainer.appendChild(pb);
  el.appendChild(pbContainer);

  const gIntMs = globalInterval * 1000;
  const itemIntervalMs = item.interval && !isNaN(parseFloat(item.interval)) ? parseFloat(item.interval) * 1000 : gIntMs;
  el.dataset.intervalMs = itemIntervalMs.toString();

  return el;
}

function renderList() {
  elementList.innerHTML = '';

  const filterCurrent = filterDomainCheckbox.checked;
  const renderableItems = items.filter((item) => {
    if (!filterCurrent || !currentTabUrl) return true;
    try {
      const regex = matchPatternToRegExp(item.matchPattern);
      return regex.test(currentTabUrl);
    } catch (_e) {
      return false;
    }
  });

  if (items.length === 0) {
    elementList.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 12px; margin: auto;">No elements added yet.<br><br>Click "+ Add New Element" to get started.</div>`;
    return;
  }

  if (renderableItems.length === 0 && items.length > 0) {
    if (filterCurrent) {
      elementList.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 12px; margin: auto;">No elements match the current domain.</div>`;
    }
    return;
  }

  renderableItems.forEach((item) => {
    elementList.appendChild(createListItem(item));
  });
}

let dragSourceEl = null;

elementList.addEventListener('dragstart', (e: DragEvent) => {
  const itemEl = (e.target as HTMLElement).closest('.element-item') as HTMLElement;
  if (!itemEl) return;
  dragSourceEl = itemEl;
  e.dataTransfer!.effectAllowed = 'move';
  e.dataTransfer!.setData('text/plain', dragSourceEl.dataset.itemId!);
  setTimeout(() => (itemEl.style.opacity = '0.4'), 0);
});

elementList.addEventListener('dragover', (e: DragEvent) => {
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'move';
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

elementList.addEventListener('dragend', (_e: DragEvent) => {
  if (dragSourceEl) {
    (dragSourceEl as HTMLElement).style.opacity = '1';
  }
  const allItems = Array.from(elementList.querySelectorAll('.element-item'));
  allItems.forEach((el) => {
    (el as HTMLElement).style.borderTop = '';
    (el as HTMLElement).style.borderBottom = '1px solid var(--border-color)';
  });
});

elementList.addEventListener('drop', (e: DragEvent) => {
  e.stopPropagation();
  e.preventDefault();

  const targetEl = (e.target as HTMLElement).closest('.element-item') as HTMLElement;

  if (targetEl && targetEl !== dragSourceEl) {
    const rect = targetEl.getBoundingClientRect();
    const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;

    const draggedId = (dragSourceEl as HTMLElement).dataset.itemId;
    const targetId = targetEl.dataset.itemId;

    if (draggedId && targetId) {
      const draggedRealIndex = items.findIndex((i) => i.id === draggedId);
      let targetRealIndex = items.findIndex((i) => i.id === targetId);

      if (draggedRealIndex > -1 && targetRealIndex > -1) {
        if (next) targetRealIndex++;

        const [movedItem] = items.splice(draggedRealIndex, 1);
        if (draggedRealIndex < targetRealIndex) targetRealIndex--;

        items.splice(targetRealIndex, 0, movedItem);

        saveItems();
        renderList();
      }
    }
  }

  if (dragSourceEl) (dragSourceEl as HTMLElement).style.opacity = '1';
  const allItems = Array.from(elementList.querySelectorAll('.element-item'));
  allItems.forEach((el) => {
    (el as HTMLElement).style.borderTop = '';
    (el as HTMLElement).style.borderBottom = '1px solid var(--border-color)';
  });
});

function saveItems() {
  browser.storage.local.set({ items: items });
  if (currentPresetId !== 'default') {
    const p = presets.find((x) => x.id === currentPresetId);
    if (p) {
      p.items = JSON.parse(JSON.stringify(items));
      savePresets();
    }
  }
}

function stopClicker() {
  if (globalIsRunning) {
    browser.storage.local.set({ isRunning: false });
  }
}

function savePresets() {
  browser.storage.local.set({ presets, currentPresetId });
}

function loadPreset(id: string) {
  if (id !== 'default') {
    const p = presets.find((x) => x.id === id);
    if (p) {
      stopClicker();
      items = JSON.parse(JSON.stringify(p.items));
      saveItems();
      renderList();
      if (p.runMode) {
        runModeSelect.value = p.runMode;
        browser.storage.local.set({ runMode: p.runMode });
      }
    }
  }
}

function renderPresets() {
  if (presets.length === 0) {
    presets = [
      {
        id: 'default_preset',
        name: 'Default',
        items: items.length > 0 ? JSON.parse(JSON.stringify(items)) : [],
        runMode: (runModeSelect.value as any) || 'sequence',
      },
    ];
    currentPresetId = 'default_preset';
    savePresets();
  }

  presetSelect.innerHTML = '';
  presetSelectDashboard.innerHTML = '';
  if (currentPresetId === 'default' && presets[0]) {
    currentPresetId = presets[0].id;
  }

  presets.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    presetSelect.appendChild(opt);
    presetSelectDashboard.appendChild(opt.cloneNode(true));
  });
  presetSelect.value = currentPresetId;
  presetSelectDashboard.value = currentPresetId;

  presetActionsBlock.style.display = 'flex';
  presetPromptDiv.style.display = 'none';
}

settingsBtn.addEventListener('click', () => {
  const isSettingsOpen = settingsView.style.display === 'flex';
  if (isSettingsOpen) {
    settingsView.style.display = 'none';
    mainView.style.display = 'flex';
    settingsBtn.style.background = 'var(--surface-color)';
    settingsBtn.style.color = 'var(--text-main)';
    toggleFormBtn.style.display = 'flex';
  } else {
    settingsView.style.display = 'flex';
    mainView.style.display = 'none';
    settingsBtn.style.background = 'var(--accent-primary)';
    settingsBtn.style.color = '#fff';
    toggleFormBtn.style.display = 'none';
  }
});

settingsBackBtn.addEventListener('click', () => {
  settingsView.style.display = 'none';
  mainView.style.display = 'flex';
  settingsBtn.style.background = 'var(--surface-color)';
  settingsBtn.style.color = 'var(--text-main)';
  toggleFormBtn.style.display = 'flex';
});

runModeSelect.addEventListener('change', () => {
  const val = runModeSelect.value;
  browser.storage.local.set({ runMode: val });
  if (currentPresetId !== 'default') {
    const p = presets.find((x) => x.id === currentPresetId);
    if (p) {
      p.runMode = val;
      savePresets();
    }
  }
});

presetSelect.addEventListener('change', () => {
  currentPresetId = presetSelect.value;
  resetDeleteButtonStyle();
  loadPreset(currentPresetId);
  savePresets();
});

presetSelectDashboard.addEventListener('change', () => {
  currentPresetId = presetSelectDashboard.value;
  resetDeleteButtonStyle();
  loadPreset(currentPresetId);
  savePresets();
});

exportSinglePresetBtn.addEventListener('click', () => {
  let exportData = null;
  if (currentPresetId !== 'default') {
    exportData = presets.find((x) => x.id === currentPresetId);
  } else {
    exportData = { id: Date.now().toString(), name: 'Exported Preset', items: items, runMode: runModeSelect.value };
  }

  if (!exportData) return;
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute('href', dataStr);
  downloadAnchorNode.setAttribute('download', `easyclicker_${exportData.name.replace(/[^A-Za-z0-9]/g, '_')}.json`);
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();

  const oldTxt = exportSinglePresetBtn.textContent;
  exportSinglePresetBtn.textContent = 'Exported!';
  setTimeout(() => (exportSinglePresetBtn.textContent = oldTxt), 1500);
});

const openImportWindow = (type) => {
  browser.windows.create({
    url: browser.runtime.getURL(`import_portal.html?type=${type}`),
    type: 'popup',
    width: 520,
    height: 300,
  });
};

importSinglePresetBtn.addEventListener('click', () => {
  openImportWindow('single');
});

exportPresetBtn.addEventListener('click', () => {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(presets, null, 2));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute('href', dataStr);
  downloadAnchorNode.setAttribute('download', 'easyclicker_presets.json');
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();

  const oldTxt = exportPresetBtn.textContent;
  exportPresetBtn.textContent = 'Exported!';
  setTimeout(() => (exportPresetBtn.textContent = oldTxt), 1500);
});

importPresetBtn.addEventListener('click', () => {
  openImportWindow('all');
});

newPresetBtn.addEventListener('click', () => {
  isRenaming = false;
  presetPromptDiv.style.display = 'flex';
  presetNameInput.value = '';
  presetConfirmBtn.textContent = 'Create';
  presetNameInput.focus();
});

renamePresetBtn.addEventListener('click', () => {
  if (currentPresetId !== 'default') {
    const p = presets.find((x) => x.id === currentPresetId);
    if (p) {
      isRenaming = true;
      presetPromptDiv.style.display = 'flex';
      presetNameInput.value = p.name;
      presetConfirmBtn.textContent = 'Rename';
      presetNameInput.focus();
    }
  }
});

presetCancelBtn.addEventListener('click', () => {
  presetPromptDiv.style.display = 'none';
  presetNameInput.value = '';
});

presetNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') presetConfirmBtn.click();
  if (e.key === 'Escape') presetCancelBtn.click();
});

presetConfirmBtn.addEventListener('click', () => {
  const name = presetNameInput.value;
  if (name && name.trim()) {
    if (isRenaming && currentPresetId !== 'default') {
      const p = presets.find((x) => x.id === currentPresetId);
      if (p) {
        p.name = name.trim();
        savePresets();
        renderPresets();
      }
    } else {
      const id = Date.now().toString();
      items = []; // Clear current items for new preset
      presets.push({
        id,
        name: name.trim(),
        items: [],
        runMode: runModeSelect.value,
      });
      currentPresetId = id;
      saveItems();
      savePresets();
      renderPresets();
      renderList();
    }
    presetPromptDiv.style.display = 'none';
    presetNameInput.value = '';
    isRenaming = false;
  }
});

let deleteConfirmState = false;
let deleteTimeout: any = null;

function resetDeleteButtonStyle() {
  if (deleteTimeout) clearTimeout(deleteTimeout);
  deleteTimeout = null;
  deleteConfirmState = false;
  deletePresetBtn.textContent = '✕';
  deletePresetBtn.style.color = 'var(--text-main)';
  deletePresetBtn.style.width = '34px';
}

deletePresetBtn.addEventListener('click', () => {
  if (currentPresetId === 'default') return;

  if (!deleteConfirmState) {
    if (deleteTimeout) clearTimeout(deleteTimeout);
    deleteConfirmState = true;
    deletePresetBtn.textContent = 'Sure?';
    deletePresetBtn.style.color = 'var(--accent-danger)';
    deletePresetBtn.style.width = '48px';

    deleteTimeout = setTimeout(() => {
      resetDeleteButtonStyle();
    }, 5000);
  } else {
    if (deleteTimeout) clearTimeout(deleteTimeout);
    deleteTimeout = null;

    presets = presets.filter((x) => x.id !== currentPresetId);
    if (presets.length === 0) {
      items = [];
      saveItems();
      renderList();
    }
    currentPresetId = 'default';
    savePresets();
    renderPresets();
    loadPreset(currentPresetId);
    resetDeleteButtonStyle();
  }
});

function toggleSelectorPlaceholder() {
  if (elementTypeObj.value === 'any') {
    selectorInput.placeholder = "e.g. .buy-btn or [name='submit'] (Required)";
  } else {
    selectorInput.placeholder = 'e.g. .buy-btn (Optional)';
  }
}

elementTypeObj.addEventListener('change', () => {
  toggleSelectorPlaceholder();
  selectorError.style.display = 'none';
});

addUpdateBtn.addEventListener('click', () => {
  const type = elementTypeObj.value;
  const match = matchTypeObj.value;
  const sel = selectorInput.value.trim();
  const cname = customNameInput.value.trim();
  const txt = targetTextInput.value.trim();
  const pattern = matchPatternInput.value.trim();
  const spd = itemIntervalInput.value.trim();

  if (type === 'any' && !sel) {
    selectorError.style.display = 'block';
    return;
  }
  selectorError.style.display = 'none';

  const editId = editIdInput.value;
  if (editId) {
    const item = items.find((i) => i.id == editId);
    if (item) {
      item.type = type;
      item.matchType = match;
      item.selector = sel;
      item.customName = cname;
      item.targetText = txt;
      item.matchPattern = pattern;
      item.interval = spd;
    }
  } else {
    items.push({
      id: Date.now().toString(),
      type: type,
      matchType: match,
      selector: sel,
      customName: cname,
      targetText: txt,
      matchPattern: pattern,
      interval: spd,
      enabled: true,
    });
  }

  closeForm();
  saveItems();
  renderList();
});

function updateStatus(running) {
  if (running) {
    toggleStartStopBtn.textContent = 'Stop';
    toggleStartStopBtn.style.backgroundColor = 'var(--accent-danger)';
  } else {
    toggleStartStopBtn.textContent = 'Start';
    toggleStartStopBtn.style.backgroundColor = 'var(--accent-primary)';
  }
}

filterDomainCheckbox.addEventListener('change', () => {
  browser.storage.local.set({ filterDomain: filterDomainCheckbox.checked });
  renderList();
});

intervalInput.addEventListener('input', () => {
  browser.storage.local.set({ interval: intervalInput.value });
});

autoStartCheckbox.addEventListener('change', () => {
  browser.storage.local.set({ autoStart: autoStartCheckbox.checked });
});

openOverlayBtn.addEventListener('click', () => {
  try {
    const url = new URL(currentTabUrl);
    browser.storage.local.get(['overlayDomains']).then((res) => {
      browser.storage.local
        .set({
          overlayDomains: { ...((res.overlayDomains as any) || {}), [url.hostname]: true },
        })
        .then(() => {
          window.close();
        });
    });
  } catch (_e) {
    window.close();
  }
});

browser.storage.onChanged.addListener((changes: Record<string, any>) => {
  if (changes.interval && changes.interval.newValue) {
    if (changes.interval.newValue !== intervalInput.value) {
      globalInterval = parseFloat(changes.interval.newValue) || 1.5;
      renderList();
    }
  }
  if (changes.startTime && changes.startTime.newValue) {
    globalStartTime = changes.startTime.newValue as number;
  }
  if (changes.isRunning !== undefined) {
    globalIsRunning = changes.isRunning.newValue as boolean;
    updateStatus(globalIsRunning);
    if (globalIsRunning) {
      if (changes.startTime) globalStartTime = changes.startTime.newValue as number;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateProgressBars);
    } else {
      if (rafId) cancelAnimationFrame(rafId);
      document.querySelectorAll('.progress-bar').forEach((bar) => ((bar as HTMLElement).style.width = '0%'));
    }
  }
  if (changes.runMode && changes.runMode.newValue) {
    if (changes.runMode.newValue !== runMode) {
      runMode = changes.runMode.newValue as string;
      runModeSelect.value = runMode;
    }
  }
  if (changes.activeSequenceItemId) {
    activeSequenceItemId = changes.activeSequenceItemId.newValue as string;
  }
  if (changes.activeSequenceItemStart) {
    activeSequenceItemStart = changes.activeSequenceItemStart.newValue as number;
  }
  if (changes.presets && changes.presets.newValue) {
    // Basic check to see if presets actually changed (by JSON stringify comparison)
    if (JSON.stringify(changes.presets.newValue) !== JSON.stringify(presets)) {
      presets = changes.presets.newValue;
      renderPresets();
    }
  }
  if (changes.currentPresetId && changes.currentPresetId.newValue) {
    if (changes.currentPresetId.newValue !== currentPresetId) {
      currentPresetId = changes.currentPresetId.newValue;
      renderPresets();
      loadPreset(currentPresetId);
    }
  }
});

browser.storage.local
  .get([
    'presets',
    'currentPresetId',
    'runMode',
    'items',
    'interval',
    'autoStart',
    'filterDomain',
    'isRunning',
    'draftItem',
    'pickedSelector',
    'pickedText',
    'startTime',
    'activeSequenceItemId',
    'activeSequenceItemStart',
  ])
  .then((res: any) => {
    if (res.runMode) {
      runMode = res.runMode as string;
      runModeSelect.value = runMode;
    }

    if (res.activeSequenceItemId) activeSequenceItemId = res.activeSequenceItemId as string;
    if (res.activeSequenceItemStart) activeSequenceItemStart = res.activeSequenceItemStart as number;

    if (res.presets) {
      presets = res.presets as Preset[];
    }
    if (res.currentPresetId) {
      currentPresetId = res.currentPresetId as string;
    }

    // Bootstrap Default preset if none exist
    if (presets.length === 0) {
      presets = [
        {
          id: 'default_preset',
          name: 'Default',
          items: (res.items || []) as ClickItem[],
          runMode: (res.runMode || 'sequence') as any,
        },
      ];
      currentPresetId = 'default_preset';
      savePresets();
    }

    renderPresets();

    if (res.interval) {
      intervalInput.value = res.interval as string;
      globalInterval = parseFloat(res.interval as string) || 1.5;
    }

    if (res.autoStart !== undefined) {
      autoStartCheckbox.checked = res.autoStart as boolean;
    }

    if (res.filterDomain !== undefined) {
      filterDomainCheckbox.checked = res.filterDomain as boolean;
    }

    globalStartTime = (res.startTime as number) || Date.now();
    globalIsRunning = (res.isRunning as boolean) || false;

    if (globalIsRunning) {
      rafId = requestAnimationFrame(updateProgressBars);
    }

    updateStatus(globalIsRunning);

    if (res.pickedSelector) {
      let finalSelector = res.pickedSelector as string;
      let targetTag = 'any';

      if (!finalSelector.includes(' ') && !finalSelector.includes('>')) {
        const knownTags = ['button', 'a', 'div', 'span', 'input', 'img'];
        for (const tag of knownTags) {
          if (
            finalSelector === tag ||
            finalSelector.startsWith(tag + '.') ||
            finalSelector.startsWith(tag + '#') ||
            finalSelector.startsWith(tag + ':') ||
            finalSelector.startsWith(tag + '[')
          ) {
            targetTag = tag;
            finalSelector = finalSelector.substring(tag.length);
            break;
          }
        }
      }

      if (res.draftItem) {
        matchTypeObj.value = (res.draftItem as any).matchType || 'first';
        customNameInput.value = (res.draftItem as any).customName || '';
        targetTextInput.value = (res.draftItem as any).targetText || '';
        matchPatternInput.value = (res.draftItem as any).matchPattern || '';
        itemIntervalInput.value = (res.draftItem as any).interval || '';
        editIdInput.value = (res.draftItem as any).editId || '';
        if ((res.draftItem as any).editId) {
          addUpdateBtn.textContent = 'Update Element';
          addUpdateBtn.classList.add('edit-mode');
        }
      }

      elementTypeObj.value = targetTag;
      selectorInput.value = finalSelector;
      if (res.pickedText) {
        targetTextInput.value = res.pickedText as string;
      }
      openForm();
      toggleSelectorPlaceholder();
      browser.storage.local.remove(['draftItem', 'pickedSelector', 'pickedText']);
    }

    if (res.items && Array.isArray(res.items)) {
      items = (res.items as any[]).map((item) => {
        if (!item.type) item.type = 'any';
        if (!item.matchType) item.matchType = 'first';

        if (item.domainRegex && !item.matchPattern) {
          const clean = item.domainRegex.replace(/\\./g, '.');
          item.matchPattern = `*://*.${clean}/*`;
        }
        delete item.domainRegex;

        return item as ClickItem;
      });
    }
    // Initialize rendering list & async active URL
    renderList();
    initTabContext();
  });

toggleStartStopBtn.addEventListener('click', () => {
  browser.runtime.sendMessage({ action: globalIsRunning ? 'stop' : 'start' });
});

toggleSelectorPlaceholder();
