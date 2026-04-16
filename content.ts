import browser from 'webextension-polyfill';
import { ClickItem, Preset, StorageData } from './types';

let itemIntervalIds: number[] = [];
let isRunning = false;
let isPicking = false;
let highlightEl: HTMLElement | null = null;
let pickerOverlay: HTMLElement | null = null;

let highlightedClickables: HTMLElement[] = [];

function addClickableHighlights() {
  if (!document.getElementById('ec-clickable-styles')) {
    const style = document.createElement('style');
    style.id = 'ec-clickable-styles';
    style.textContent = `
      .ec-clickable-element {
        outline: 2px dashed #f59e0b !important;
        outline-offset: -2px !important;
        background-color: rgba(245, 158, 11, 0.2) !important;
      }
    `;
    document.head.appendChild(style);
  }

  const allEls = document.querySelectorAll('*');
  allEls.forEach((el) => {
    if (!(el instanceof HTMLElement)) return;

    let isClickable = false;
    const tag = el.tagName.toLowerCase();

    if (tag === 'button' || tag === 'a' || tag === 'select') {
      isClickable = true;
    } else if (tag === 'input' && ['button', 'submit', 'checkbox', 'radio'].includes((el as HTMLInputElement).type)) {
      isClickable = true;
    } else if (el.hasAttribute('onclick') || (el as any).onclick === 'function') {
      isClickable = true;
    } else if (el.hasAttribute('role') && ['button', 'link', 'menuitem', 'tab'].includes(el.getAttribute('role') || '')) {
      isClickable = true;
    } else {
      const computed = window.getComputedStyle(el);
      if (computed.cursor === 'pointer') {
        isClickable = true;
      }
    }

    if (isClickable) {
      el.classList.add('ec-clickable-element');
      highlightedClickables.push(el);
    }
  });
}

function removeClickableHighlights() {
  highlightedClickables.forEach((el) => {
    try {
      el.classList.remove('ec-clickable-element');
    } catch (_e) {}
  });
  highlightedClickables = [];

  const style = document.getElementById('ec-clickable-styles');
  if (style) style.remove();
}

function cleanText(node: HTMLElement): string | null {
  const text = (node.innerText || node.textContent || '').trim().replace(/\s+/g, ' ');
  if (text.length > 0 && text.length < 60) return text;
  return null;
}

function isUniqueWithText(selector, textToCheck) {
  try {
    const els = Array.from(document.querySelectorAll(selector));
    if (els.length === 1 && !textToCheck) return true;
    if (textToCheck) {
      const searchTarget = textToCheck.toLowerCase();
      const filtered = els.filter((n) => {
        const it = (n.innerText || '').toLowerCase().replace(/\s+/g, ' ');
        const tc = (n.textContent || '').toLowerCase().replace(/\s+/g, ' ');
        return it.includes(searchTarget) || tc.includes(searchTarget);
      });
      return filtered.length === 1;
    }
    return false;
  } catch (_e) {
    return false;
  }
}

function getCssSelector(el) {
  if (el.tagName.toLowerCase() == 'html') return { path: 'html', text: null };
  if (el.tagName.toLowerCase() == 'body') return { path: 'body', text: null };

  const getClasses = (node) => {
    if (typeof node.className !== 'string' || !node.className.trim()) return '';
    const classes = node.className
      .trim()
      .split(/\s+/)
      .filter((c) => c && !c.includes(':') && !c.includes('['));
    return classes.length ? '.' + classes.map((c) => CSS.escape(c)).join('.') : '';
  };

  const targetText = cleanText(el);
  const tag = el.tagName.toLowerCase();

  if (el.id) {
    const idSel = `#${CSS.escape(el.id)}`;
    if (isUniqueWithText(idSel, null)) return { path: idSel, text: null };
  }

  const elClasses = getClasses(el);
  const tagClassSelector = tag + elClasses;

  if (elClasses && isUniqueWithText(tagClassSelector, null)) {
    return { path: tagClassSelector, text: null };
  }

  if (elClasses && targetText && isUniqueWithText(tagClassSelector, targetText)) {
    return { path: tagClassSelector, text: targetText };
  }

  const pathArr: string[] = [];
  let currentEl = el;
  let usedText = false;

  while (currentEl && currentEl.nodeType === Node.ELEMENT_NODE && currentEl.tagName.toLowerCase() !== 'html') {
    let selector = currentEl.tagName.toLowerCase();

    if (currentEl.id) {
      selector += `#${CSS.escape(currentEl.id)}`;
      pathArr.unshift(selector);

      if (isUniqueWithText(pathArr.join(' > '), null)) break;
      if (targetText && isUniqueWithText(pathArr.join(' > '), targetText)) {
        usedText = true;
        break;
      }
    } else {
      const classes = getClasses(currentEl);
      selector += classes;

      let needsNth = false;
      let nth = 1;

      let sibling = currentEl.parentNode ? currentEl.parentNode.firstElementChild : null;
      while (sibling) {
        if (sibling !== currentEl && sibling.tagName.toLowerCase() === currentEl.tagName.toLowerCase()) {
          if (getClasses(sibling) === classes) {
            needsNth = true;
          }
        }
        if (sibling === currentEl) break;
        if (sibling.tagName.toLowerCase() === currentEl.tagName.toLowerCase()) nth++;
        sibling = sibling.nextElementSibling;
      }

      if (needsNth) {
        if (currentEl === el && targetText) {
          usedText = true;
        } else {
          selector += `:nth-of-type(${nth})`;
        }
      }

      pathArr.unshift(selector);
    }

    const pathStr = pathArr.join(' > ');
    if (!usedText && isUniqueWithText(pathStr, null)) break;
    if (targetText && isUniqueWithText(pathStr, targetText)) {
      usedText = true;
      break;
    }

    currentEl = currentEl.parentNode;
  }

  return { path: pathArr.join(' > '), text: usedText ? targetText : null };
}

function hoverHandler(e: MouseEvent): void {
  if (!isPicking) return;

  const target = e.target as HTMLElement;
  if (pickerOverlay && target === pickerOverlay) return;

  if (highlightEl && highlightEl !== target) {
    highlightEl.style.outline = highlightEl.dataset.oldOutline || '';
    highlightEl.style.backgroundColor = highlightEl.dataset.oldBg || '';
    if (!highlightEl.dataset.oldOutline) highlightEl.style.removeProperty('outline');
    if (!highlightEl.dataset.oldBg) highlightEl.style.removeProperty('background-color');
  }

  if (highlightEl !== target) {
    highlightEl = target;
    highlightEl.dataset.oldOutline = highlightEl.style.outline;
    highlightEl.dataset.oldBg = highlightEl.style.backgroundColor;

    highlightEl.style.setProperty('outline', '2px solid #ef4444', 'important');
    highlightEl.style.setProperty('background-color', 'rgba(239, 68, 68, 0.2)', 'important');
  }

  if (pickerOverlay) {
    const tagName = highlightEl.tagName.toLowerCase();
    const id = highlightEl.id ? `#${highlightEl.id}` : '';
    let classes = '';

    if (typeof highlightEl.className === 'string' && highlightEl.className.trim() !== '') {
      classes = '.' + highlightEl.className.trim().split(/\s+/).join('.');
    }

    const textPreview = highlightEl.innerText
      ? `\nText: "${highlightEl.innerText.substring(0, 40)}${highlightEl.innerText.length > 40 ? '...' : ''}"`
      : '';

    pickerOverlay.innerText = `<${tagName}${id}${classes}>${textPreview}`;

    const rect = pickerOverlay.getBoundingClientRect();
    let left = e.clientX + 15;
    let top = e.clientY + 15;

    if (left + rect.width > window.innerWidth) {
      left = e.clientX - rect.width - 15;
    }
    if (top + rect.height > window.innerHeight) {
      top = e.clientY - rect.height - 15;
    }

    pickerOverlay.style.left = Math.max(0, left) + 'px';
    pickerOverlay.style.top = Math.max(0, top) + 'px';
  }
}

function clickHandler(e: MouseEvent): void {
  if (!isPicking) return;
  if (!e.isTrusted) return;
  e.preventDefault();
  e.stopPropagation();

  isPicking = false;

  if (highlightEl) {
    highlightEl.style.outline = highlightEl.dataset.oldOutline || '';
    highlightEl.style.backgroundColor = highlightEl.dataset.oldBg || '';
  }

  document.removeEventListener('mouseover', hoverHandler as any, true);
  document.removeEventListener('click', clickHandler as any, true);

  if (pickerOverlay && pickerOverlay.parentNode) {
    pickerOverlay.parentNode.removeChild(pickerOverlay);
  }
  pickerOverlay = null;
  removeClickableHighlights();

  const selectorData = getCssSelector(e.target as HTMLElement);
  browser.storage.local.set({
    pickedSelector: selectorData.path,
    pickedText: selectorData.text || '',
  });
}

function escapeRegexHost(host) {
  return host.replace(/[\\^$+?.()|[\]{}]/g, '\\$&');
}

function matchPatternToRegExp(pattern: string): RegExp {
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

function clickElement(item) {
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
      const innerText = (el.innerText || '').toLowerCase().replace(/\s+/g, ' ');
      const textContent = (el.textContent || '').toLowerCase().replace(/\s+/g, ' ');
      return innerText.includes(searchTarget) || textContent.includes(searchTarget);
    });
  }

  if (elements.length === 0) return;

  const matchType = item.matchType || 'first';

  if (matchType === 'first') {
    elements[0].click();
  } else if (matchType === 'last') {
    elements[elements.length - 1].click();
  } else if (matchType === 'all') {
    elements.forEach((el) => el.click());
  }
}

function canProcessItem(item) {
  if (!item.matchPattern) return true;
  try {
    const regex = matchPatternToRegExp(item.matchPattern);
    return regex.test(window.location.href);
  } catch (_e) {
    return false;
  }
}

function processItem(item) {
  if (canProcessItem(item)) {
    clickElement(item);
  }
}

let sequenceStopFlag = false;
let currentSequenceTimer: any = null;
let currentSequenceResolve: any = null;
let sequenceId = 0;

let currentRunMode = 'sequence';
let activeSequenceItemId: string | null = null;
let activeSequenceItemStart = 0;

function startClicker() {
  stopClicker();
  isRunning = true;
  sequenceStopFlag = false;
  sequenceId++;
  const mySequenceId = sequenceId;

  browser.storage.local.get(['items', 'interval', 'runMode']).then(async (res: Partial<StorageData>) => {
    if (mySequenceId !== sequenceId) return;

    const items = (res.items || []) as ClickItem[];
    const globalIntervalMs = (parseFloat(res.interval || '1.5') || 1.5) * 1000;
    const runMode = res.runMode || 'sequence';
    currentRunMode = runMode;

    if (runMode === 'parallel') {
      items.forEach((item) => {
        if (item.enabled) {
          const itemIntervalMs =
            item.interval && !isNaN(parseFloat(item.interval)) ? parseFloat(item.interval) * 1000 : globalIntervalMs;

          const id = setInterval(() => processItem(item), itemIntervalMs);
          itemIntervalIds.push(id);
        }
      });
    } else {
      // Sequence Mode
      while (isRunning && !sequenceStopFlag && mySequenceId === sequenceId) {
        let processedAny = false;
        for (let i = 0; i < items.length; i++) {
          if (!isRunning || sequenceStopFlag || mySequenceId !== sequenceId) break;
          const item = items[i];
          if (item.enabled && canProcessItem(item)) {
            clickElement(item);
            processedAny = true;
            const itemIntervalMs =
              item.interval && !isNaN(parseFloat(item.interval)) ? parseFloat(item.interval) * 1000 : globalIntervalMs;

            browser.storage.local.set({ activeSequenceItemId: item.id, activeSequenceItemStart: Date.now() });

            await new Promise((resolve) => {
              currentSequenceResolve = resolve;
              currentSequenceTimer = setTimeout(resolve, itemIntervalMs);
            });
            if (currentSequenceResolve) currentSequenceResolve = null;
          }
        }
        if (!processedAny) {
          await new Promise((resolve) => {
            currentSequenceResolve = resolve;
            currentSequenceTimer = setTimeout(resolve, 1000);
          });
          if (currentSequenceResolve) currentSequenceResolve = null;
        }
      }
    }
  });
}

function stopClicker() {
  isRunning = false;
  sequenceStopFlag = true;
  sequenceId++;
  if (currentSequenceTimer) {
    clearTimeout(currentSequenceTimer);
    currentSequenceTimer = null;
  }
  if (currentSequenceResolve) {
    currentSequenceResolve();
    currentSequenceResolve = null;
  }
  itemIntervalIds.forEach((id) => clearInterval(id));
  itemIntervalIds = [];
  browser.storage.local.set({ activeSequenceItemId: null });
}

let currentOverlayItems: ClickItem[] = [];
let isOverlayVisible = false;
let pageOverlayEl: HTMLElement | null = null;

let globalInterval = 1.5;
let globalStartTime = 0;
let rafId: number | null = null;

let overlayPresets: Preset[] = [];
let overlayCurrentPresetId = 'default';

let overlayPosX = -1;
let overlayPosY = -1;
let overlayPositions: Record<string, { x: number; y: number }> = {};

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

let isPinnedRight = false;
let isPinnedBottom = false;

function enforceOverlayBounds() {
  if (!pageOverlayEl) return;
  const rect = pageOverlayEl.getBoundingClientRect();
  const SNAP_DIST = 20;

  isPinnedRight = false;
  isPinnedBottom = false;

  if (overlayPosX < SNAP_DIST) {
    overlayPosX = 0;
  } else if (window.innerWidth - (overlayPosX + rect.width) < SNAP_DIST) {
    overlayPosX = window.innerWidth - rect.width;
    isPinnedRight = true;
  }

  if (overlayPosY < SNAP_DIST) {
    overlayPosY = 0;
  } else if (window.innerHeight - (overlayPosY + rect.height) < SNAP_DIST) {
    overlayPosY = window.innerHeight - rect.height;
    isPinnedBottom = true;
  }

  if (overlayPosX < 0) overlayPosX = 0;
  if (overlayPosY < 0) overlayPosY = 0;
  if (overlayPosX + rect.width > window.innerWidth) overlayPosX = window.innerWidth - rect.width;
  if (overlayPosY + rect.height > window.innerHeight) overlayPosY = window.innerHeight - rect.height;

  pageOverlayEl.style.left = overlayPosX + 'px';
  pageOverlayEl.style.top = overlayPosY + 'px';
  pageOverlayEl.style.right = 'auto';
  pageOverlayEl.style.bottom = 'auto'; // Disable CSS lock
}

window.addEventListener('resize', () => {
  if (isOverlayVisible && pageOverlayEl) {
    const rect = pageOverlayEl.getBoundingClientRect();
    if (isPinnedRight) overlayPosX = window.innerWidth - rect.width;
    if (isPinnedBottom) overlayPosY = window.innerHeight - rect.height;
    enforceOverlayBounds();
  }
});

function updateProgressBars() {
  if (!pageOverlayEl || !isRunning) return;
  const now = Date.now();
  const els = pageOverlayEl.querySelectorAll('.element-item');
  els.forEach((el) => {
    const bar = el.querySelector('.progress-bar') as HTMLElement;
    if (!bar) return;
    const isEnabled = (el.querySelector('input[type="checkbox"]') as HTMLInputElement).checked;

    if (!isEnabled) {
      if (bar.classList.contains('ec-fast-mode')) bar.classList.remove('ec-fast-mode');
      bar.style.width = '0%';
      return;
    }

    if (currentRunMode === 'sequence') {
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
        if (elapsed < 0) return;
        const progress = (elapsed % itemIntervalMs) / itemIntervalMs;
        bar.style.width = `${progress * 100}%`;
      }
    }
  });
  rafId = requestAnimationFrame(updateProgressBars);
}

function initDrag(headerEl: HTMLElement, containerEl: HTMLElement): void {
  let isDragging = false;
  let startX: number, startY: number;

  headerEl.addEventListener('mousedown', (e: MouseEvent) => {
    if ((e.target as HTMLElement).tagName.toLowerCase() === 'div' && (e.target as HTMLElement).innerText === '×')
      return;
    isDragging = true;
    startX = e.clientX - overlayPosX;
    startY = e.clientY - overlayPosY;
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    overlayPosX = e.clientX - startX;
    overlayPosY = e.clientY - startY;
    containerEl.style.left = overlayPosX + 'px';
    containerEl.style.top = overlayPosY + 'px';
    containerEl.style.right = 'auto';
    containerEl.style.bottom = 'auto';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.userSelect = '';
      enforceOverlayBounds();

      overlayPositions = { ...overlayPositions, [window.location.hostname]: { x: overlayPosX, y: overlayPosY } };
      browser.storage.local.set({ overlayPositions });
    }
  });
}

function updatePageOverlay() {
  if (!isOverlayVisible) {
    if (pageOverlayEl) {
      pageOverlayEl.remove();
      pageOverlayEl = null;
    }
    if (rafId) cancelAnimationFrame(rafId);
    return;
  }

  if (!pageOverlayEl) {
    if (!document.getElementById('ec-overlay-styles')) {
      const style = document.createElement('style');
      style.id = 'ec-overlay-styles';
      style.textContent = `
        .ec-fast-mode {
          width: 100% !important;
          background: linear-gradient(90deg, #3b82f6 0%, #e71c4f 50%, #3b82f6 100%) !important;
          background-size: 200% 100% !important;
          animation: ec-wave 1s linear infinite !important;
        }
        @keyframes ec-wave {
          0% { background-position: 200% 0; }
          100% { background-position: 0 0; }
        }
      `;
      document.head.appendChild(style);
    }

    pageOverlayEl = document.createElement('div');
    pageOverlayEl.id = 'ec-page-overlay';

    if (overlayPosX === -1 || overlayPosY === -1) {
      // Default to top-right
      overlayPosX = window.innerWidth - 300 - 20; // 280w + 20 padding
      overlayPosY = 20;
    }

    Object.assign(pageOverlayEl.style, {
      position: 'fixed',
      left: overlayPosX + 'px',
      top: overlayPosY + 'px',
      zIndex: '2147483647',
      backgroundColor: '#1e293b',
      color: '#f8fafc',
      padding: '12px',
      borderRadius: '8px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '13px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
      border: '1px solid #334155',
      width: '280px',
      maxHeight: '400px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    });
    document.body.appendChild(pageOverlayEl);
    enforceOverlayBounds();
  }

  pageOverlayEl.innerHTML = '';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.cursor = 'grab';
  header.style.paddingBottom = '4px';
  header.style.borderBottom = '1px solid #334155';
  header.onmousedown = () => (header.style.cursor = 'grabbing');
  header.onmouseup = () => (header.style.cursor = 'grab');

  initDrag(header, pageOverlayEl);

  const title = document.createElement('div');
  title.style.fontWeight = '700';
  title.style.fontSize = '14px';
  title.style.lineHeight = '1';
  title.innerText = 'Easy Clicker';

  const closeBtnWrap = document.createElement('div');
  Object.assign(closeBtnWrap.style, {
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    width: '18px',
    height: '18px',
  });
  closeBtnWrap.onmouseover = () => (closeBtnWrap.style.backgroundColor = 'rgba(255,255,255,0.1)');
  closeBtnWrap.onmouseout = () => (closeBtnWrap.style.backgroundColor = 'transparent');

  const closeBtn = document.createElement('div');
  closeBtn.innerText = '×';
  Object.assign(closeBtn.style, {
    fontSize: '20px',
    lineHeight: '1',
    color: '#94a3b8',
    fontWeight: 'bold',
    paddingBottom: '2px',
  });
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
  listContainer.style.flex = '1';
  listContainer.style.overflowY = 'auto';
  listContainer.style.display = 'flex';
  listContainer.style.flexDirection = 'column';
  listContainer.style.gap = '8px';
  listContainer.style.maxHeight = '250px';
  listContainer.style.border = '1px solid #334155';
  listContainer.style.borderRadius = '6px';
  listContainer.style.padding = '8px';
  listContainer.style.background = '#0f172a';

  listContainer.style.scrollbarWidth = 'thin';
  listContainer.style.scrollbarColor = '#334155 transparent';

  const filteredOverlayItems = currentOverlayItems.filter((item) => canProcessItem(item));

  if (filteredOverlayItems.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.innerText = currentOverlayItems.length > 0 ? 'No matching elements on this page' : 'No elements added';
    emptyMsg.style.color = '#94a3b8';
    emptyMsg.style.textAlign = 'center';
    emptyMsg.style.padding = '10px 0';
    emptyMsg.style.fontSize = '11px';
    listContainer.appendChild(emptyMsg);
  } else {
    filteredOverlayItems.forEach((item) => {
      const itemRow = document.createElement('div');
      itemRow.className = 'element-item';
      itemRow.style.position = 'relative';
      itemRow.style.display = 'flex';
      itemRow.style.flexDirection = 'column';
      itemRow.style.paddingBottom = '4px';

      const itemIntervalMs =
        item.interval && !isNaN(parseFloat(item.interval)) ? parseFloat(item.interval) * 1000 : globalInterval * 1000;
      itemRow.dataset.intervalMs = itemIntervalMs.toString();
      itemRow.dataset.itemId = item.id;

      const elSection = document.createElement('div');
      elSection.style.display = 'flex';
      elSection.style.alignItems = 'center';
      elSection.style.gap = '8px';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = item.enabled;
      cb.style.cursor = 'pointer';
      cb.style.width = '14px';
      cb.style.height = '14px';
      cb.style.margin = '0';
      cb.style.flexShrink = '0';
      cb.addEventListener('change', () => {
        item.enabled = cb.checked;
        browser.storage.local.set({ items: currentOverlayItems });
      });

      const name = document.createElement('div');
      name.style.flex = '1';
      name.style.overflow = 'hidden';
      name.style.textOverflow = 'ellipsis';
      name.style.whiteSpace = 'nowrap';
      name.style.fontSize = '12px';
      const fullSel = item.type === 'any' ? item.selector : item.type + (item.selector || '');
      name.innerText = item.customName ? item.customName : generateConciseTitle(item, fullSel);
      name.title = fullSel;

      elSection.appendChild(cb);
      elSection.appendChild(name);
      itemRow.appendChild(elSection);

      const pbContainer = document.createElement('div');
      Object.assign(pbContainer.style, {
        position: 'absolute',
        bottom: '0',
        left: '0',
        width: '100%',
        height: '2px',
        background: 'transparent',
      });
      const pb = document.createElement('div');
      pb.className = 'progress-bar';
      Object.assign(pb.style, {
        height: '100%',
        background: '#3b82f6',
        width: '0%',
        transition: 'none',
      });
      pbContainer.appendChild(pb);
      itemRow.appendChild(pbContainer);

      listContainer.appendChild(itemRow);
    });
  }

  pageOverlayEl.appendChild(listContainer);

  const presetRow = document.createElement('div');
  Object.assign(presetRow.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '8px',
    marginTop: '4px',
  });

  const presetLabel = document.createElement('div');
  presetLabel.innerText = 'Preset:';
  Object.assign(presetLabel.style, { color: '#94a3b8', fontSize: '11px', fontWeight: '500', whiteSpace: 'nowrap' });

  const overlayPresetSelect = document.createElement('select');
  Object.assign(overlayPresetSelect.style, {
    flex: '1',
    background: '#1e293b',
    color: '#f8fafc',
    border: '1px solid #334155',
    borderRadius: '4px',
    padding: '2px 4px',
    fontSize: '11px',
    cursor: 'pointer',
    outline: 'none',
  });

  if (overlayPresets.length === 0) {
    const noOpt = document.createElement('option');
    noOpt.value = 'default';
    noOpt.innerText = 'No presets saved';
    noOpt.disabled = true;
    noOpt.selected = true;
    overlayPresetSelect.appendChild(noOpt);
  } else {
    overlayPresets.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.innerText = p.name;
      overlayPresetSelect.appendChild(opt);
    });
    overlayPresetSelect.value = overlayCurrentPresetId !== 'default' ? overlayCurrentPresetId : overlayPresets[0].id;
  }

  overlayPresetSelect.onchange = () => {
    const selectedId = overlayPresetSelect.value;
    if (selectedId !== 'default') {
      const p = overlayPresets.find((x) => x.id === selectedId);
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
    overlayCurrentPresetId = selectedId;
  };

  presetRow.appendChild(presetLabel);
  presetRow.appendChild(overlayPresetSelect);
  pageOverlayEl.appendChild(presetRow);

  const controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.gap = '8px';

  const toggleBtn = document.createElement('button');
  toggleBtn.innerText = isRunning ? 'Stop' : 'Start';
  Object.assign(toggleBtn.style, {
    width: '100%',
    flex: '1',
    padding: '8px',
    border: 'none',
    borderRadius: '4px',
    color: 'white',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '13px',
    backgroundColor: isRunning ? '#ef4444' : '#3b82f6',
    transition: 'all 0.2s',
  });

  toggleBtn.onmouseover = () => (toggleBtn.style.backgroundColor = isRunning ? '#dc2626' : '#2563eb');
  toggleBtn.onmouseout = () => (toggleBtn.style.backgroundColor = isRunning ? '#ef4444' : '#3b82f6');

  toggleBtn.onclick = () => {
    browser.runtime.sendMessage({ action: isRunning ? 'stop' : 'start' });
  };

  controls.appendChild(toggleBtn);
  pageOverlayEl.appendChild(controls);

  if (isRunning) {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(updateProgressBars);
  }

  if (pageOverlayEl) {
    const rect = pageOverlayEl.getBoundingClientRect();
    if (isPinnedRight) overlayPosX = window.innerWidth - rect.width;
    if (isPinnedBottom) overlayPosY = window.innerHeight - rect.height;
    enforceOverlayBounds();
  }
}

browser.storage.onChanged.addListener((changes: Record<string, any>) => {
  let needsOverlayUpdate = false;

  if (changes.interval && changes.interval.newValue) {
    globalInterval = parseFloat(changes.interval.newValue) || 1.5;
  }
  if (changes.startTime && changes.startTime.newValue) {
    globalStartTime = changes.startTime.newValue;
  }

  if (changes.runMode && changes.runMode.newValue) {
    currentRunMode = changes.runMode.newValue;
  }
  if (changes.activeSequenceItemId) {
    activeSequenceItemId = changes.activeSequenceItemId.newValue;
  }
  if (changes.activeSequenceItemStart) {
    activeSequenceItemStart = changes.activeSequenceItemStart.newValue;
  }

  if (changes.items) {
    currentOverlayItems = (changes.items.newValue as ClickItem[]) || [];
    needsOverlayUpdate = true;
  }

  if (changes.presets) {
    overlayPresets = (changes.presets.newValue as Preset[]) || [];
    needsOverlayUpdate = true;
  }

  if (changes.currentPresetId) {
    overlayCurrentPresetId = changes.currentPresetId.newValue || 'default';
    needsOverlayUpdate = true;
  }

  if (changes.overlayPositions) {
    overlayPositions = changes.overlayPositions.newValue || {};
    const pos = overlayPositions[window.location.hostname];
    if (pos) {
      overlayPosX = pos.x;
      overlayPosY = pos.y;
      if (pageOverlayEl) {
        pageOverlayEl.style.left = overlayPosX + 'px';
        pageOverlayEl.style.top = overlayPosY + 'px';
      }
    }
  }

  if (changes.overlayDomains) {
    const domains = (changes.overlayDomains.newValue as Record<string, boolean>) || {};
    isOverlayVisible = domains[window.location.hostname] === true;
    needsOverlayUpdate = true;
  }

  if (changes.isRunning !== undefined) {
    if (changes.isRunning.newValue) {
      startClicker();
    } else {
      stopClicker();
    }
    needsOverlayUpdate = true;
  } else if (isRunning) {
    if (changes.items || changes.interval || changes.runMode) {
      startClicker();
    }
  }

  if (needsOverlayUpdate) {
    updatePageOverlay();
  }
});

function startPicker() {
  isPicking = true;

  if (!pickerOverlay) {
    pickerOverlay = document.createElement('div');
    pickerOverlay.style.position = 'fixed';
    pickerOverlay.style.zIndex = '2147483647';
    pickerOverlay.style.backgroundColor = '#1e293b';
    pickerOverlay.style.color = '#f8fafc';
    pickerOverlay.style.padding = '8px 12px';
    pickerOverlay.style.borderRadius = '6px';
    pickerOverlay.style.fontSize = '12px';
    pickerOverlay.style.fontFamily = 'monospace';
    pickerOverlay.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
    pickerOverlay.style.pointerEvents = 'none'; // Critical to prevent blocking hover events
    pickerOverlay.style.border = '1px solid #3b82f6';
    pickerOverlay.style.whiteSpace = 'pre-wrap';
    pickerOverlay.style.maxWidth = '300px';
    pickerOverlay.style.wordBreak = 'break-all';
    document.body.appendChild(pickerOverlay);
  }

  addClickableHighlights();

  document.addEventListener('mouseover', hoverHandler as any, true);
  document.addEventListener('click', clickHandler as any, true);
}

browser.runtime.onMessage.addListener((message: any) => {
  if (message.action === 'startPicking') {
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
    currentOverlayItems = (res.items || []) as ClickItem[];
    const domains = res.overlayDomains || {};
    isOverlayVisible = domains[window.location.hostname] === true;
    if (res.interval) globalInterval = parseFloat(res.interval) || 1.5;
    globalStartTime = res.startTime || Date.now();
    currentRunMode = res.runMode || 'sequence';
    activeSequenceItemId = res.activeSequenceItemId || null;
    activeSequenceItemStart = res.activeSequenceItemStart || 0;
    overlayPresets = res.presets || [];
    overlayCurrentPresetId = res.currentPresetId || 'default';
    overlayPositions = res.overlayPositions || {};

    const savedPos = overlayPositions[window.location.hostname];
    if (savedPos) {
      overlayPosX = savedPos.x;
      overlayPosY = savedPos.y;
    }

    if (res.autoStart) {
      const activeItems = (currentOverlayItems as ClickItem[]).filter((item) => item.enabled && canProcessItem(item));
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
