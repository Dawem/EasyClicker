import { state } from './popup/state';
import {
  addSection,
  toggleFormBtn,
  cancelFormBtn,
  elementTypeObj,
  matchTypeObj,
  selectorInput,
  selectorError,
  customNameInput,
  targetTextInput,
  matchPatternInput,
  itemIntervalInput,
  intervalInput,
  autoStartCheckbox,
  addUpdateBtn,
  editIdInput,
  elementList,
  filterDomainCheckbox,
  toggleStartStopBtn,
  openOverlayBtn,
  runModeSelect,
  presetSelect,
  presetSelectDashboard,
  newPresetBtn,
  deletePresetBtn,
  renamePresetBtn,
  presetActionsBlock,
  exportSinglePresetBtn,
  importSinglePresetBtn,
  exportPresetBtn,
  importPresetBtn,
  presetPromptDiv,
  presetNameInput,
  presetConfirmBtn,
  presetCancelBtn,
  settingsBtn,
  settingsView,
  mainView,
  settingsBackBtn,
  pickBtn,
} from './popup/dom';
import browser from 'webextension-polyfill';
import { ClickItem, DraftItem, Preset, StorageData } from './types';
import { generateConciseTitle, getApexDomain, matchPatternToRegExp, createElement } from './utils';

function updateProgressBars() {
  if (!state.globalIsRunning) return;
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

    if (state.runMode === 'sequence') {
      const itemId = (el as HTMLElement).dataset.itemId;
      if (itemId === state.activeSequenceItemId) {
        const itemIntervalMs = (el as HTMLElement).dataset.intervalMs
          ? parseFloat((el as HTMLElement).dataset.intervalMs!)
          : state.globalInterval * 1000;
        const elapsed = now - state.activeSequenceItemStart;
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
        : state.globalInterval * 1000;
      if (itemIntervalMs < 100) {
        if (!bar.classList.contains('fast-mode')) bar.classList.add('fast-mode');
      } else {
        if (bar.classList.contains('fast-mode')) bar.classList.remove('fast-mode');
        const elapsed = now - state.globalStartTime;
        if (elapsed < 0) return;
        const progress = (elapsed % itemIntervalMs) / itemIntervalMs;
        bar.style.width = `${progress * 100}%`;
      }
    }
  });
  state.rafId = requestAnimationFrame(updateProgressBars);
}

function initTabContext() {
  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    if (tabs.length > 0 && tabs[0].url) {
      state.currentTabUrl = tabs[0].url;
      try {
        const url = new URL(tabs[0].url);
        if (url.hostname) {
          const apexDomain = getApexDomain(url.hostname);
          state.defaultMatchPattern = `*://*.${apexDomain}/*`;
          if (!matchPatternInput.value && !editIdInput.value) {
            matchPatternInput.value = state.defaultMatchPattern;
          }
        }
      } catch (_e) {}
    }
    renderList();
  });
}

const dashboardView = document.getElementById('dashboardView') as HTMLElement;

function showView(viewName: 'main' | 'form' | 'settings') {
  mainView.style.display = viewName === 'settings' ? 'none' : 'flex';
  settingsView.style.display = viewName === 'settings' ? 'flex' : 'none';
  addSection.style.display = viewName === 'form' ? 'block' : 'none';
  dashboardView.style.display = viewName === 'main' ? 'flex' : 'none';

  const isSettings = viewName === 'settings';
  settingsBtn.style.background = isSettings ? 'var(--accent-primary)' : 'var(--surface-color)';
  settingsBtn.style.color = isSettings ? '#fff' : 'var(--text-main)';
  settingsBtn.style.display = viewName === 'form' ? 'none' : 'flex';
  toggleFormBtn.style.display = viewName === 'main' ? 'flex' : 'none';
}

function openForm() {
  showView('form');
}

function closeForm() {
  showView('main');
  editIdInput.value = '';
  addUpdateBtn.textContent = 'Add Element';
  addUpdateBtn.classList.remove('edit-mode');
  selectorInput.value = '';
  customNameInput.value = '';
  targetTextInput.value = '';
  matchPatternInput.value = state.defaultMatchPattern;
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
          browser.tabs.sendMessage(tabs[0].id!, { action: 'startPicking' }).catch(() => {});
        }
        window.close();
      });
    });
});

function createIconBtn(
  innerHTML: string,
  title: string,
  onClick: () => void,
  className = 'icon-btn',
): HTMLButtonElement {
  return createElement('button', {
    className,
    innerHTML,
    title,
    onclick: (e: MouseEvent) => {
      e.stopPropagation();
      onClick();
    },
  });
}

function createListItem(item: ClickItem): HTMLElement {
  const el = createElement('div', {
    className: 'element-item',
    draggable: true,
  });
  el.dataset.itemId = item.id;

  const dragHandleStyles = {
    cursor: 'grab',
    color: 'var(--text-muted)',
    fontSize: '14px',
    paddingRight: '4px',
    userSelect: 'none',
  };

  const dragHandle = createElement('div', {
    innerHTML: '⋮⋮',
    style: { ...dragHandleStyles },
  });
  el.appendChild(dragHandle);

  const checkbox = createElement('input', {
    type: 'checkbox',
    className: 'item-checkbox',
    checked: item.enabled,
  });
  checkbox.onchange = () => {
    item.enabled = checkbox.checked;
    saveItems();
  };

  const info = createElement('div', { className: 'item-info' });

  const fullSel = item.type === 'any' ? item.selector : item.type + (item.selector || '');
  const selDiv = createElement('div', {
    className: 'item-selector',
    textContent: item.customName ? item.customName : generateConciseTitle(item, fullSel),
    title: fullSel,
  });

  const matchBadge = createElement('span', {
    className: 'match-badge',
    textContent: item.matchType || 'first',
  });
  selDiv.appendChild(matchBadge);
  info.appendChild(selDiv);

  if (item.interval) {
    const extrasDiv = createElement('div', {
      className: 'item-text',
      textContent: `Speed: ${item.interval}s`,
    });
    info.appendChild(extrasDiv);
  }

  const actions = createElement('div', { className: 'item-actions' });

  actions.appendChild(
    createIconBtn(
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`,
      'Edit',
      () => {
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
    ),
  );

  actions.appendChild(
    createIconBtn(
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
      'Duplicate',
      () => {
        const newItem = JSON.parse(JSON.stringify(item));
        newItem.id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
        const index = state.items.findIndex((i) => i.id === item.id);
        if (index > -1) {
          state.items.splice(index + 1, 0, newItem);
        } else {
          state.items.push(newItem);
        }
        saveItems();
        renderList();
      },
    ),
  );

  actions.appendChild(
    createIconBtn(
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
      'Remove',
      () => {
        state.items = state.items.filter((i) => i.id !== item.id);
        if (editIdInput.value === item.id) closeForm();
        saveItems();
        renderList();
      },
      'icon-btn danger',
    ),
  );

  el.appendChild(checkbox);
  el.appendChild(info);
  el.appendChild(actions);

  const pbContainer = createElement('div', { className: 'progress-bar-container' });
  const pb = createElement('div', { className: 'progress-bar' });
  pbContainer.appendChild(pb);
  el.appendChild(pbContainer);

  const gIntMs = state.globalInterval * 1000;
  const itemIntervalMs = item.interval && !isNaN(parseFloat(item.interval)) ? parseFloat(item.interval) * 1000 : gIntMs;
  el.dataset.intervalMs = itemIntervalMs.toString();

  return el;
}

function renderList() {
  elementList.innerHTML = '';

  const filterCurrent = filterDomainCheckbox.checked;
  const renderableItems = state.items.filter((item) => {
    if (!filterCurrent || !state.currentTabUrl) return true;
    try {
      const regex = matchPatternToRegExp(item.matchPattern);
      return regex.test(state.currentTabUrl);
    } catch (_e) {
      return false;
    }
  });

  if (state.items.length === 0) {
    elementList.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 12px; margin: auto;">No elements added yet.<br><br>Click "+ Add New Element" to get started.</div>`;
    return;
  }

  if (renderableItems.length === 0 && state.items.length > 0) {
    if (filterCurrent) {
      elementList.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 12px; margin: auto;">No elements match the current domain.</div>`;
    }
    return;
  }

  renderableItems.forEach((item) => {
    elementList.appendChild(createListItem(item));
  });
}

let dragSourceEl: HTMLElement | null = null;

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
  if (dragSourceEl && targetEl && targetEl !== dragSourceEl) {
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

  if (dragSourceEl && targetEl && targetEl !== dragSourceEl) {
    const rect = targetEl.getBoundingClientRect();
    const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;

    const draggedId = (dragSourceEl as HTMLElement).dataset.itemId || '';
    const targetId = targetEl.dataset.itemId || '';

    if (draggedId && targetId) {
      const draggedRealIndex = state.items.findIndex((i) => i.id === draggedId);
      let targetRealIndex = state.items.findIndex((i) => i.id === targetId);

      if (draggedRealIndex > -1 && targetRealIndex > -1) {
        if (next) targetRealIndex++;

        const [movedItem] = state.items.splice(draggedRealIndex, 1);
        if (draggedRealIndex < targetRealIndex) targetRealIndex--;

        state.items.splice(targetRealIndex, 0, movedItem);

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

function getCurrentPreset(): Preset | undefined {
  if (state.currentPresetId === 'default') return undefined;
  return state.presets.find((x) => x.id === state.currentPresetId);
}

function saveItems() {
  browser.storage.local.set({ items: state.items });
  const p = getCurrentPreset();
  if (p) {
    p.items = JSON.parse(JSON.stringify(state.items));
    savePresets();
  }
}

function stopClicker() {
  if (state.globalIsRunning) {
    browser.storage.local.set({ isRunning: false });
  }
}

function savePresets() {
  browser.storage.local.set({ presets: state.presets, currentPresetId: state.currentPresetId });
}

function loadPreset(_id: string) {
  const p = getCurrentPreset();
  if (p) {
    stopClicker();
    state.items = JSON.parse(JSON.stringify(p.items));
    saveItems();
    renderList();
    if (p.runMode) {
      runModeSelect.value = p.runMode;
      browser.storage.local.set({ runMode: p.runMode });
    }
  }
}

function renderPresets() {
  if (state.presets.length === 0) {
    state.presets = [
      {
        id: 'default_preset',
        name: 'Default',
        items: state.items.length > 0 ? JSON.parse(JSON.stringify(state.items)) : [],
        runMode: runModeSelect.value || 'sequence',
      },
    ];
    state.currentPresetId = 'default_preset';
    savePresets();
  }

  presetSelect.innerHTML = '';
  presetSelectDashboard.innerHTML = '';
  if (state.currentPresetId === 'default' && state.presets[0]) {
    state.currentPresetId = state.presets[0].id;
  }

  state.presets.forEach((p) => {
    const opt = createElement('option', {
      value: p.id,
      textContent: p.name,
    });
    presetSelect.appendChild(opt);
    presetSelectDashboard.appendChild(opt.cloneNode(true));
  });
  presetSelect.value = state.currentPresetId;
  presetSelectDashboard.value = state.currentPresetId;

  presetActionsBlock.style.display = 'flex';
  presetPromptDiv.style.display = 'none';
}

settingsBtn.addEventListener('click', () => {
  const isSettingsOpen = settingsView.style.display === 'flex';
  showView(isSettingsOpen ? 'main' : 'settings');
});

settingsBackBtn.addEventListener('click', () => {
  showView('main');
});

runModeSelect.addEventListener('change', () => {
  const val = runModeSelect.value;
  browser.storage.local.set({ runMode: val });
  const p = getCurrentPreset();
  if (p) {
    p.runMode = val;
    savePresets();
  }
});

presetSelect.addEventListener('change', () => {
  state.currentPresetId = presetSelect.value;
  resetDeleteButtonStyle();
  loadPreset(state.currentPresetId);
  savePresets();
});

presetSelectDashboard.addEventListener('change', () => {
  state.currentPresetId = presetSelectDashboard.value;
  resetDeleteButtonStyle();
  loadPreset(state.currentPresetId);
  savePresets();
});

exportSinglePresetBtn.addEventListener('click', () => {
  const exportData = getCurrentPreset() || {
    id: Date.now().toString(),
    name: 'Exported Preset',
    items: state.items,
    runMode: runModeSelect.value,
  };

  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
  const downloadAnchorNode = createElement('a', {
    href: dataStr,
    download: `easyclicker_${exportData.name.replace(/[^A-Za-z0-9]/g, '_')}.json`,
  });
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();

  const oldTxt = exportSinglePresetBtn.textContent;
  exportSinglePresetBtn.textContent = 'Exported!';
  setTimeout(() => (exportSinglePresetBtn.textContent = oldTxt), 1500);
});

const openImportWindow = (type: string) => {
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
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state.presets, null, 2));
  const downloadAnchorNode = createElement('a', {
    href: dataStr,
    download: 'easyclicker_presets.json',
  });
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
  state.isRenaming = false;
  presetPromptDiv.style.display = 'flex';
  presetNameInput.value = '';
  presetConfirmBtn.textContent = 'Create';
  presetNameInput.focus();
});

renamePresetBtn.addEventListener('click', () => {
  const p = getCurrentPreset();
  if (p) {
    state.isRenaming = true;
    presetPromptDiv.style.display = 'flex';
    presetNameInput.value = p.name;
    presetConfirmBtn.textContent = 'Rename';
    presetNameInput.focus();
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
    const p = getCurrentPreset();
    if (state.isRenaming && p) {
      p.name = name.trim();
      savePresets();
      renderPresets();
    } else {
      const id = Date.now().toString();
      state.items = [];
      state.presets.push({
        id,
        name: name.trim(),
        items: [],
        runMode: runModeSelect.value,
      });
      state.currentPresetId = id;
      saveItems();
      savePresets();
      renderPresets();
      renderList();
    }
    presetPromptDiv.style.display = 'none';
    presetNameInput.value = '';
    state.isRenaming = false;
  }
});

let deleteConfirmState = false;
let deleteTimeout: ReturnType<typeof setTimeout> | null = null;

function resetDeleteButtonStyle() {
  if (deleteTimeout) clearTimeout(deleteTimeout);
  deleteTimeout = null;
  deleteConfirmState = false;
  deletePresetBtn.textContent = '✕';
  deletePresetBtn.style.color = 'var(--text-main)';
  deletePresetBtn.style.width = '34px';
}

deletePresetBtn.addEventListener('click', () => {
  if (state.currentPresetId === 'default') return;

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

    state.presets = state.presets.filter((x) => x.id !== state.currentPresetId);
    if (state.presets.length === 0) {
      state.items = [];
      saveItems();
      renderList();
    }
    state.currentPresetId = 'default';
    savePresets();
    renderPresets();
    loadPreset(state.currentPresetId);
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
    const item = state.items.find((i) => i.id == editId);
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
    state.items.push({
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

function updateStatus(running: boolean) {
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
    const url = new URL(state.currentTabUrl);
    browser.storage.local.get(['overlayDomains']).then((res) => {
      browser.storage.local
        .set({
          overlayDomains: { ...((res.overlayDomains as Record<string, boolean>) || {}), [url.hostname]: true },
        })
        .then(() => {
          window.close();
        });
    });
  } catch (_e) {
    window.close();
  }
});

browser.storage.onChanged.addListener((changes: Record<string, { newValue?: unknown; oldValue?: unknown }>) => {
  if (changes.interval && changes.interval.newValue) {
    if (changes.interval.newValue !== intervalInput.value) {
      state.globalInterval = parseFloat(changes.interval.newValue as string) || 1.5;
      renderList();
    }
  }
  if (changes.startTime && changes.startTime.newValue) {
    state.globalStartTime = changes.startTime.newValue as number;
  }
  if (changes.isRunning !== undefined) {
    state.globalIsRunning = changes.isRunning.newValue as boolean;
    updateStatus(state.globalIsRunning);
    if (state.globalIsRunning) {
      if (changes.startTime) state.globalStartTime = changes.startTime.newValue as number;
      if (state.rafId) cancelAnimationFrame(state.rafId);
      state.rafId = requestAnimationFrame(updateProgressBars);
    } else {
      if (state.rafId) cancelAnimationFrame(state.rafId);
      document.querySelectorAll('.progress-bar').forEach((bar) => ((bar as HTMLElement).style.width = '0%'));
    }
  }
  if (changes.runMode && changes.runMode.newValue) {
    if (changes.runMode.newValue !== state.runMode) {
      state.runMode = changes.runMode.newValue as string;
      runModeSelect.value = state.runMode;
    }
  }
  if (changes.activeSequenceItemId) {
    state.activeSequenceItemId = changes.activeSequenceItemId.newValue as string;
  }
  if (changes.activeSequenceItemStart) {
    state.activeSequenceItemStart = changes.activeSequenceItemStart.newValue as number;
  }
  if (changes.presets && changes.presets.newValue) {
    if (JSON.stringify(changes.presets.newValue) !== JSON.stringify(state.presets)) {
      state.presets = changes.presets.newValue as Preset[];
      renderPresets();
    }
  }
  if (changes.currentPresetId && changes.currentPresetId.newValue) {
    if (changes.currentPresetId.newValue !== state.currentPresetId) {
      state.currentPresetId = changes.currentPresetId.newValue as string;
      renderPresets();
      loadPreset(state.currentPresetId);
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
  .then((res: Partial<StorageData & { draftItem: DraftItem; pickedSelector: string; pickedText: string }>) => {
    if (res.runMode) {
      state.runMode = res.runMode as string;
      runModeSelect.value = state.runMode;
    }

    if (res.activeSequenceItemId) state.activeSequenceItemId = res.activeSequenceItemId as string;
    if (res.activeSequenceItemStart) state.activeSequenceItemStart = res.activeSequenceItemStart as number;

    if (res.presets) {
      state.presets = res.presets as Preset[];
    }
    if (res.currentPresetId) {
      state.currentPresetId = res.currentPresetId as string;
    }

    if (state.presets.length === 0) {
      state.presets = [
        {
          id: 'default_preset',
          name: 'Default',
          items: state.items.length > 0 ? JSON.parse(JSON.stringify(state.items)) : [],
          runMode: runModeSelect.value || 'sequence',
        },
      ];
      state.currentPresetId = 'default_preset';
      savePresets();
    }

    renderPresets();

    if (res.interval) {
      intervalInput.value = res.interval as string;
      state.globalInterval = parseFloat(res.interval as string) || 1.5;
    }

    if (res.autoStart !== undefined) {
      autoStartCheckbox.checked = res.autoStart as boolean;
    }

    if (res.filterDomain !== undefined) {
      filterDomainCheckbox.checked = res.filterDomain as boolean;
    }

    state.globalStartTime = (res.startTime as number) || Date.now();
    state.globalIsRunning = (res.isRunning as boolean) || false;

    if (state.globalIsRunning) {
      state.rafId = requestAnimationFrame(updateProgressBars);
    }

    updateStatus(state.globalIsRunning);

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
        matchTypeObj.value = res.draftItem.matchType || 'first';
        customNameInput.value = res.draftItem.customName || '';
        targetTextInput.value = res.draftItem.targetText || '';
        matchPatternInput.value = res.draftItem.matchPattern || '';
        itemIntervalInput.value = res.draftItem.interval || '';
        editIdInput.value = res.draftItem.editId || '';
        if (res.draftItem.editId) {
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
      state.items = (res.items as ClickItem[]).map((item) => {
        if (!item.type) item.type = 'any';
        if (!item.matchType) item.matchType = 'first';

        const legacy = item as ClickItem & { domainRegex?: string };
        if (legacy.domainRegex && !item.matchPattern) {
          const clean = legacy.domainRegex.replace(/\\./g, '.');
          item.matchPattern = `*://*.${clean}/*`;
        }
        delete legacy.domainRegex;

        return item as ClickItem;
      });
    }
    renderList();
    initTabContext();
  });

toggleStartStopBtn.addEventListener('click', () => {
  browser.runtime.sendMessage({ action: state.globalIsRunning ? 'stop' : 'start' });
});

toggleSelectorPlaceholder();
