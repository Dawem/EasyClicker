const addSection = document.getElementById('addSection');
const toggleFormBtn = document.getElementById('toggleFormBtn');
const cancelFormBtn = document.getElementById('cancelFormBtn');

const elementTypeObj = document.getElementById('elementType');
const matchTypeObj = document.getElementById('matchType');
const selectorInput = document.getElementById('selector');
const selectorError = document.getElementById('selectorError');
const customNameInput = document.getElementById('customName');
const targetTextInput = document.getElementById('targetText');
const matchPatternInput = document.getElementById('matchPattern');
const itemIntervalInput = document.getElementById('itemInterval');
const intervalInput = document.getElementById('interval');
const addUpdateBtn = document.getElementById('addUpdateBtn');
const editIdInput = document.getElementById('editId');
const elementList = document.getElementById('elementList');
const filterDomainCheckbox = document.getElementById('filterDomain');
const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');

const pickBtn = document.getElementById('pickBtn');

let items = [];
let defaultMatchPattern = '';
let currentTabUrl = '';

let rafId = null;
let globalIsRunning = false;
let globalInterval = 1.5;
let globalStartTime = 0;

function updateProgressBars() {
  if (!globalIsRunning) return;
  const now = Date.now();
  const els = document.querySelectorAll('.element-item');
  els.forEach((el) => {
    const bar = el.querySelector('.progress-bar');
    if (!bar) return;
    const isEnabled = el.querySelector('.item-checkbox').checked;
    if (!isEnabled) {
      bar.style.width = '0%';
      bar.classList.remove('fast-mode');
      return;
    }
    const itemIntervalMs = el.dataset.intervalMs ? parseFloat(el.dataset.intervalMs) : globalInterval * 1000;

    if (itemIntervalMs < 100) {
      if (!bar.classList.contains('fast-mode')) bar.classList.add('fast-mode');
    } else {
      if (bar.classList.contains('fast-mode')) bar.classList.remove('fast-mode');
      const elapsed = now - globalStartTime;
      if (elapsed < 0) return;
      const progress = (elapsed % itemIntervalMs) / itemIntervalMs;
      bar.style.width = `${progress * 100}%`;
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
  let parts = pattern.split('://');
  if (parts.length !== 2) return /$.^/;

  let scheme = parts[0];
  let hostAndPath = parts[1];

  if (scheme === '*') {
    regex += '(http|https)://';
  } else {
    regex += escapeRegexHost(scheme) + '://';
  }

  let hostIndex = hostAndPath.indexOf('/');
  if (hostIndex === -1) hostIndex = hostAndPath.length;

  let host = hostAndPath.substring(0, hostIndex);
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
  } catch (e) {
    return /$.^/;
  }
}

function initTabContext() {
  browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
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
      } catch (e) {
        // Not a standard URL, disregard
      }
    }
    // Renders the list again after grabbing the URL gracefully resolving filtering checks
    renderList();
  });
}

const dashboardView = document.getElementById('dashboardView');

function openForm() {
  addSection.style.display = 'block';
  toggleFormBtn.style.display = 'none';
  dashboardView.style.display = 'none';
}

function closeForm() {
  addSection.style.display = 'none';
  toggleFormBtn.style.display = 'flex';
  dashboardView.style.display = 'flex';

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
  browser.storage.local.set({
    draftItem: {
      type: elementTypeObj.value,
      matchType: matchTypeObj.value,
      customName: customNameInput.value,
      targetText: targetTextInput.value,
      matchPattern: matchPatternInput.value,
      interval: itemIntervalInput.value,
      editId: editIdInput.value
    }
  }).then(() => {
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs.length > 0) {
        browser.tabs.sendMessage(tabs[0].id, { action: 'startPicking' }).catch(() => { });
      }
      window.close();
    });
  });
});

function generateConciseTitle(item, fullSel) {
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

function createListItem(item) {
  const el = document.createElement('div');
  el.className = 'element-item';

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
  let fullSel = item.type === 'any' ? item.selector : item.type + (item.selector || '');

  selDiv.textContent = item.customName ? item.customName : generateConciseTitle(item, fullSel);
  selDiv.title = fullSel;

  const matchBadge = document.createElement('span');
  matchBadge.className = 'match-badge';
  matchBadge.textContent = item.matchType || 'first';
  selDiv.appendChild(matchBadge);
  info.appendChild(selDiv);

  const rawSelDiv = document.createElement('div');
  rawSelDiv.className = 'item-text';
  rawSelDiv.style.fontFamily = 'monospace';
  rawSelDiv.style.opacity = '0.75';
  rawSelDiv.textContent = fullSel.length > 35 ? fullSel.substring(0, 35) + '...' : fullSel;
  rawSelDiv.title = fullSel;
  info.appendChild(rawSelDiv);

  if (item.matchPattern || item.interval) {
    const extrasDiv = document.createElement('div');
    extrasDiv.className = 'item-text';

    let extras = [];
    if (item.matchPattern) extras.push(`Pattern: ${item.matchPattern}`);
    if (item.interval) extras.push(`Speed: ${item.interval}s`);

    extrasDiv.textContent = extras.join(' | ');
    info.appendChild(extrasDiv);
  }

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'icon-btn';
  editBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`;
  editBtn.title = "Edit";
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

  const removeBtn = document.createElement('button');
  removeBtn.className = 'icon-btn danger';
  removeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  removeBtn.title = "Remove";
  removeBtn.addEventListener('click', () => {
    items = items.filter(i => i.id !== item.id);
    if (editIdInput.value === item.id) closeForm();
    saveItems();
    renderList();
  });

  actions.appendChild(editBtn);
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
  const itemIntervalMs = item.interval && !isNaN(parseFloat(item.interval))
    ? parseFloat(item.interval) * 1000
    : gIntMs;
  el.dataset.intervalMs = itemIntervalMs;

  return el;
}

function renderList() {
  elementList.innerHTML = '';

  const filterCurrent = filterDomainCheckbox.checked;
  const renderableItems = items.filter(item => {
    if (!filterCurrent || !currentTabUrl) return true;
    try {
      const regex = matchPatternToRegExp(item.matchPattern);
      return regex.test(currentTabUrl);
    } catch (e) {
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

  renderableItems.forEach(item => {
    elementList.appendChild(createListItem(item));
  });
}

function saveItems() {
  browser.storage.local.set({ items: items });
}

function toggleSelectorPlaceholder() {
  if (elementTypeObj.value === 'any') {
    selectorInput.placeholder = "e.g. .buy-btn or [name='submit'] (Required)";
  } else {
    selectorInput.placeholder = "e.g. .buy-btn (Optional)";
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
    const item = items.find(i => i.id == editId);
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
      enabled: true
    });
  }

  closeForm();
  saveItems();
  renderList();
});

const statusBadge = document.getElementById('statusBadge');

function updateStatus(running) {
  if (running) {
    statusBadge.textContent = 'RUNNING';
    statusBadge.style.background = 'rgba(16, 185, 129, 0.2)';
    statusBadge.style.color = '#10b981';
    statusBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
    startBtn.style.opacity = '0.5';
    startBtn.style.pointerEvents = 'none';
    stopBtn.style.opacity = '1';
    stopBtn.style.pointerEvents = 'auto';
    stopBtn.style.transform = 'scale(1.02)';
  } else {
    statusBadge.textContent = 'IDLE';
    statusBadge.style.background = 'var(--surface-color)';
    statusBadge.style.color = 'var(--text-muted)';
    statusBadge.style.borderColor = 'var(--border-color)';
    startBtn.style.opacity = '1';
    startBtn.style.pointerEvents = 'auto';
    stopBtn.style.opacity = '0.5';
    stopBtn.style.pointerEvents = 'none';
    stopBtn.style.transform = 'scale(1)';
  }
}

filterDomainCheckbox.addEventListener('change', () => {
  renderList();
});

intervalInput.addEventListener('input', () => {
  browser.storage.local.set({ interval: intervalInput.value });
});

browser.storage.onChanged.addListener((changes) => {
  if (changes.interval && changes.interval.newValue) {
    globalInterval = parseFloat(changes.interval.newValue) || 1.5;
    renderList();
  }
  if (changes.startTime && changes.startTime.newValue) {
    globalStartTime = changes.startTime.newValue;
  }
  if (changes.isRunning !== undefined) {
    globalIsRunning = changes.isRunning.newValue;
    updateStatus(globalIsRunning);
    if (globalIsRunning) {
      if (changes.startTime) globalStartTime = changes.startTime.newValue;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateProgressBars);
    } else {
      cancelAnimationFrame(rafId);
      document.querySelectorAll('.progress-bar').forEach(bar => bar.style.width = '0%');
    }
  }
});

browser.storage.local.get(['items', 'interval', 'isRunning', 'draftItem', 'pickedSelector', 'pickedText', 'startTime']).then((res) => {
  if (res.interval) {
    intervalInput.value = res.interval;
    globalInterval = parseFloat(res.interval) || 1.5;
  }

  globalStartTime = res.startTime || Date.now();
  globalIsRunning = res.isRunning || false;

  if (globalIsRunning) {
    rafId = requestAnimationFrame(updateProgressBars);
  }

  updateStatus(res.isRunning);

  if (res.pickedSelector) {
    let finalSelector = res.pickedSelector;
    let targetTag = 'any';

    if (!finalSelector.includes(' ') && !finalSelector.includes('>')) {
      const knownTags = ['button', 'a', 'div', 'span', 'input', 'img'];
      for (const tag of knownTags) {
        if (finalSelector === tag || finalSelector.startsWith(tag + '.') || finalSelector.startsWith(tag + '#') || finalSelector.startsWith(tag + ':') || finalSelector.startsWith(tag + '[')) {
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
      targetTextInput.value = res.pickedText;
    }
    openForm();
    toggleSelectorPlaceholder();
    browser.storage.local.remove(['draftItem', 'pickedSelector', 'pickedText']);
  }

  if (res.items && Array.isArray(res.items)) {
    items = res.items.map(item => {
      if (!item.type) item.type = 'any';
      if (!item.matchType) item.matchType = 'first';

      if (item.domainRegex && !item.matchPattern) {
        let clean = item.domainRegex.replace(/\\./g, '.');
        item.matchPattern = `*://*.${clean}/*`;
      }
      delete item.domainRegex;

      return item;
    });
  }
  // Initialize rendering list & async active URL
  renderList();
  initTabContext();
});

startBtn.addEventListener('click', () => {
  browser.runtime.sendMessage({ action: 'start' });
});

stopBtn.addEventListener('click', () => {
  browser.runtime.sendMessage({ action: 'stop' });
});

toggleSelectorPlaceholder();
