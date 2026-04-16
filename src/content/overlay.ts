import browser from 'webextension-polyfill';
import { ClickItem, Preset } from '../shared/types';
import { generateConciseTitle } from '../shared/utils';

let pageOverlayEl: HTMLElement | null = null;
let overlayPosX = -1;
let overlayPosY = -1;
let isOverlayVisible = false;
let isPinnedRight = false;
let isPinnedBottom = false;

export function initDrag(header: HTMLElement, container: HTMLElement) {
  let pos1 = 0,
    pos2 = 0,
    pos3 = 0,
    pos4 = 0;
  header.onmousedown = dragMouseDown;

  function dragMouseDown(e: MouseEvent) {
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
    if (header.classList.contains('ec-header')) header.classList.add('grabbing');
  }

  function elementDrag(e: MouseEvent) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;

    const newTop = container.offsetTop - pos2;
    const newLeft = container.offsetLeft - pos1;

    container.style.top = newTop + 'px';
    container.style.left = newLeft + 'px';

    overlayPosX = newLeft;
    overlayPosY = newTop;

    enforceOverlayBounds();
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
    if (header.classList.contains('ec-header')) header.classList.remove('grabbing');

    browser.storage.local.set({ overlayPosX, overlayPosY });
  }
}

export function enforceOverlayBounds() {
  if (!pageOverlayEl) return;
  const rect = pageOverlayEl.getBoundingClientRect();
  const pad = 10;

  let top = pageOverlayEl.offsetTop;
  let left = pageOverlayEl.offsetLeft;

  if (top < pad) top = pad;
  if (left < pad) left = pad;
  if (top + rect.height > window.innerHeight - pad) top = window.innerHeight - rect.height - pad;
  if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad;

  pageOverlayEl.style.top = top + 'px';
  pageOverlayEl.style.left = left + 'px';

  isPinnedRight = left + rect.width > window.innerWidth - 50;
  isPinnedBottom = top + rect.height > window.innerHeight - 50;

  if (isPinnedRight) {
    pageOverlayEl.style.left = 'auto';
    pageOverlayEl.style.right = window.innerWidth - (left + rect.width) + 'px';
  } else {
    pageOverlayEl.style.right = 'auto';
  }

  if (isPinnedBottom) {
    pageOverlayEl.style.top = 'auto';
    pageOverlayEl.style.bottom = window.innerHeight - (top + rect.height) + 'px';
  } else {
    pageOverlayEl.style.bottom = 'auto';
  }
}

window.addEventListener('resize', () => {
  if (isOverlayVisible && pageOverlayEl) {
    const rect = pageOverlayEl.getBoundingClientRect();
    if (isPinnedRight) overlayPosX = window.innerWidth - rect.width;
    if (isPinnedBottom) overlayPosY = window.innerHeight - rect.height;
    enforceOverlayBounds();
  }
});

export function updateProgressBars(
  isRunning: boolean,
  mode: 'sequence' | 'parallel',
  activeSequenceItemId: string | null,
  activeSequenceItemStart: number,
  globalStartTime: number,
  globalInterval: number,
) {
  if (!pageOverlayEl || !isRunning) return;
  const now = Date.now();
  const els = pageOverlayEl.querySelectorAll('.ec-item-row');
  els.forEach((el) => {
    const bar = el.querySelector('.ec-progress-bar') as HTMLElement;
    if (!bar) return;
    const isEnabled = (el.querySelector('input[type="checkbox"]') as HTMLInputElement).checked;

    if (!isEnabled) {
      if (bar.classList.contains('ec-fast-mode')) bar.classList.remove('ec-fast-mode');
      bar.style.width = '0%';
      return;
    }

    if (mode === 'sequence') {
      const itemId = (el as HTMLElement).dataset.itemId;
      if (itemId === activeSequenceItemId) {
        const itemIntervalMs = (el as HTMLElement).dataset.intervalMs
          ? parseFloat((el as HTMLElement).dataset.intervalMs as string)
          : globalInterval * 1000;
        const elapsed = now - activeSequenceItemStart;
        const progress = Math.min(1, Math.max(0, elapsed / itemIntervalMs));
        bar.style.width = `${progress * 100}%`;
        bar.style.opacity = '1';
        if (bar.classList.contains('ec-fast-mode')) bar.classList.remove('ec-fast-mode');
      } else {
        bar.style.width = '0%';
      }
    } else {
      const itemIntervalMs = (el as HTMLElement).dataset.intervalMs
        ? parseFloat((el as HTMLElement).dataset.intervalMs as string)
        : globalInterval * 1000;
      if (itemIntervalMs < 100) {
        if (!bar.classList.contains('ec-fast-mode')) bar.classList.add('ec-fast-mode');
      } else {
        if (bar.classList.contains('ec-fast-mode')) bar.classList.remove('ec-fast-mode');
        const elapsed = now - globalStartTime;
        const progress = (elapsed % itemIntervalMs) / itemIntervalMs;
        bar.style.width = `${progress * 100}%`;
      }
    }
  });
}

export function toggleOverlay(visible: boolean) {
  isOverlayVisible = visible;
  if (!visible && pageOverlayEl) {
    pageOverlayEl.remove();
    pageOverlayEl = null;
  }
}

export function updateOverlay(
  items: ClickItem[],
  presets: Preset[],
  currentPresetId: string,
  isRunning: boolean,
  globalInterval: number,
  canProcessItem: (item: ClickItem) => boolean,
) {
  if (!isOverlayVisible) return;

  if (!pageOverlayEl) {
    pageOverlayEl = document.createElement('div');
    pageOverlayEl.id = 'ec-page-overlay';

    if (overlayPosX === -1 || overlayPosY === -1) {
      overlayPosX = window.innerWidth - 300 - 20;
      overlayPosY = 20;
    }

    pageOverlayEl.style.left = overlayPosX + 'px';
    pageOverlayEl.style.top = overlayPosY + 'px';

    document.body.appendChild(pageOverlayEl);
    enforceOverlayBounds();
  }

  pageOverlayEl.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'ec-header';
  initDrag(header, pageOverlayEl);

  const title = document.createElement('div');
  title.className = 'ec-title';
  title.innerText = 'Easy Clicker';

  const closeBtnWrap = document.createElement('div');
  closeBtnWrap.className = 'ec-close-wrap';

  const closeBtn = document.createElement('div');
  closeBtn.className = 'ec-close';
  closeBtn.innerText = '×';
  closeBtnWrap.onclick = () => {
    browser.storage.local.get(['overlayDomains']).then((res) => {
      browser.storage.local.set({
        overlayDomains: { ...((res.overlayDomains as any) || {}), [window.location.hostname]: false },
      });
    });
  };
  closeBtnWrap.appendChild(closeBtn);
  header.appendChild(title);
  header.appendChild(closeBtnWrap);
  pageOverlayEl.appendChild(header);

  const listContainer = document.createElement('div');
  listContainer.className = 'ec-list-container';

  const filteredItems = items.filter((item) => canProcessItem(item));

  if (filteredItems.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'ec-empty-msg';
    emptyMsg.innerText = items.length > 0 ? 'No matching elements on this page' : 'No elements added';
    listContainer.appendChild(emptyMsg);
  } else {
    filteredItems.forEach((item) => {
      const itemRow = document.createElement('div');
      itemRow.className = 'ec-item-row';

      const itemIntervalMs =
        item.interval && !isNaN(parseFloat(item.interval)) ? parseFloat(item.interval) * 1000 : globalInterval * 1000;
      itemRow.dataset.intervalMs = itemIntervalMs.toString();
      itemRow.dataset.itemId = item.id;

      const elSection = document.createElement('div');
      elSection.className = 'ec-el-section';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'ec-checkbox';
      cb.checked = item.enabled;
      cb.addEventListener('change', () => {
        item.enabled = cb.checked;
        browser.storage.local.set({ items: items });
      });

      const name = document.createElement('div');
      name.className = 'ec-item-name';
      const fullSel = item.type === 'any' ? item.selector : item.type + (item.selector || '');
      name.innerText = item.customName ? item.customName : generateConciseTitle(item, fullSel);
      name.title = fullSel;

      elSection.appendChild(cb);
      elSection.appendChild(name);
      itemRow.appendChild(elSection);

      const pbContainer = document.createElement('div');
      pbContainer.className = 'ec-pb-container';

      const pb = document.createElement('div');
      pb.className = 'ec-progress-bar';
      pbContainer.appendChild(pb);
      itemRow.appendChild(pbContainer);

      listContainer.appendChild(itemRow);
    });
  }

  pageOverlayEl.appendChild(listContainer);

  const presetRow = document.createElement('div');
  presetRow.className = 'ec-preset-row';

  const presetLabel = document.createElement('div');
  presetLabel.className = 'ec-preset-label';
  presetLabel.innerText = 'Preset:';

  const overlayPresetSelect = document.createElement('select');
  overlayPresetSelect.className = 'ec-preset-select';

  if (presets.length === 0) {
    const noOpt = document.createElement('option');
    noOpt.value = 'default';
    noOpt.innerText = 'No presets saved';
    noOpt.disabled = true;
    noOpt.selected = true;
    overlayPresetSelect.appendChild(noOpt);
  } else {
    presets.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.innerText = p.name;
      overlayPresetSelect.appendChild(opt);
    });
    overlayPresetSelect.value = currentPresetId !== 'default' ? currentPresetId : presets[0].id;
  }

  overlayPresetSelect.onchange = () => {
    const selectedId = overlayPresetSelect.value;
    if (selectedId !== 'default') {
      const p = presets.find((x) => x.id === selectedId);
      if (p) {
        browser.storage.local.set({
          isRunning: false,
          items: JSON.parse(JSON.stringify(p.items)),
          currentPresetId: selectedId,
        });
        if (p.runMode) browser.storage.local.set({ runMode: p.runMode });
      }
    } else {
      browser.storage.local.set({ currentPresetId: 'default' });
    }
  };

  presetRow.appendChild(presetLabel);
  presetRow.appendChild(overlayPresetSelect);
  pageOverlayEl.appendChild(presetRow);

  const controls = document.createElement('div');
  controls.className = 'ec-controls';

  const toggleBtn = document.createElement('button');
  toggleBtn.className = `ec-toggle-btn ${isRunning ? 'ec-stop' : 'ec-start'}`;
  toggleBtn.innerText = isRunning ? 'Stop' : 'Start';

  toggleBtn.onclick = () => {
    browser.runtime.sendMessage({ action: isRunning ? 'stop' : 'start' });
  };

  controls.appendChild(toggleBtn);
  pageOverlayEl.appendChild(controls);

  // Update drag bounds initially
  enforceOverlayBounds();
}

export function setOverlayCoords(x: number, y: number) {
  overlayPosX = x;
  overlayPosY = y;
}
