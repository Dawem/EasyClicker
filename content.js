if (typeof browser === "undefined") {
  globalThis.browser = chrome;
}

let itemIntervalIds = [];
let isRunning = false;
let isPicking = false;
let highlightEl = null;
let pickerOverlay = null;

let highlightedClickables = [];

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
  allEls.forEach(el => {
    if (!(el instanceof HTMLElement)) return;
    
    let isClickable = false;
    const tag = el.tagName.toLowerCase();
    
    if (tag === 'button' || tag === 'a' || tag === 'select') {
      isClickable = true;
    } else if (tag === 'input' && ['button', 'submit', 'checkbox', 'radio'].includes(el.type)) {
      isClickable = true;
    } else if (el.hasAttribute('onclick') || typeof el.onclick === 'function') {
      isClickable = true;
    } else if (el.hasAttribute('role') && ['button', 'link', 'menuitem', 'tab'].includes(el.getAttribute('role'))) {
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
  highlightedClickables.forEach(el => {
    try {
      el.classList.remove('ec-clickable-element');
    } catch(e) {}
  });
  highlightedClickables = [];
  
  const style = document.getElementById('ec-clickable-styles');
  if (style) style.remove();
}

function cleanText(node) {
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
      const filtered = els.filter(n => {
        const it = (n.innerText || '').toLowerCase().replace(/\s+/g, ' ');
        const tc = (n.textContent || '').toLowerCase().replace(/\s+/g, ' ');
        return it.includes(searchTarget) || tc.includes(searchTarget);
      });
      return filtered.length === 1;
    }
    return false;
  } catch (e) { return false; }
}

function getCssSelector(el) {
  if (el.tagName.toLowerCase() == 'html') return { path: 'html', text: null };
  if (el.tagName.toLowerCase() == 'body') return { path: 'body', text: null };

  const getClasses = (node) => {
    if (typeof node.className !== 'string' || !node.className.trim()) return '';
    const classes = node.className.trim().split(/\s+/).filter(c => c && !c.includes(':') && !c.includes('['));
    return classes.length ? '.' + classes.map(c => CSS.escape(c)).join('.') : '';
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

  let pathArr = [];
  let currentEl = el;
  let usedText = false;

  while (currentEl && currentEl.nodeType === Node.ELEMENT_NODE && currentEl.tagName.toLowerCase() !== 'html') {
    let selector = currentEl.tagName.toLowerCase();

    if (currentEl.id) {
      selector += `#${CSS.escape(currentEl.id)}`;
      pathArr.unshift(selector);

      if (isUniqueWithText(pathArr.join(' > '), null)) break;
      if (targetText && isUniqueWithText(pathArr.join(' > '), targetText)) {
        usedText = true; break;
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

function hoverHandler(e) {
  if (!isPicking) return;

  if (pickerOverlay && e.target === pickerOverlay) return;

  if (highlightEl && highlightEl !== e.target) {
    highlightEl.style.outline = highlightEl.dataset.oldOutline || '';
    highlightEl.style.backgroundColor = highlightEl.dataset.oldBg || '';
    if (!highlightEl.dataset.oldOutline) highlightEl.style.removeProperty('outline');
    if (!highlightEl.dataset.oldBg) highlightEl.style.removeProperty('background-color');
  }

  // Prevent infinite attribute mapping updates if lingering dynamically
  if (highlightEl !== e.target) {
    highlightEl = e.target;
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

    const textPreview = highlightEl.innerText ? `\nText: "${highlightEl.innerText.substring(0, 40)}${highlightEl.innerText.length > 40 ? '...' : ''}"` : '';

    pickerOverlay.innerText = `<${tagName}${id}${classes}>${textPreview}`;

    // Lock position alongside mouse cursor padding safely globally
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

function clickHandler(e) {
  if (!isPicking) return;
  if (!e.isTrusted) return;
  e.preventDefault();
  e.stopPropagation();

  isPicking = false;

  if (highlightEl) {
    highlightEl.style.outline = highlightEl.dataset.oldOutline || '';
    highlightEl.style.backgroundColor = highlightEl.dataset.oldBg || '';
  }

  document.removeEventListener('mouseover', hoverHandler, true);
  document.removeEventListener('click', clickHandler, true);

  if (pickerOverlay && pickerOverlay.parentNode) {
    pickerOverlay.parentNode.removeChild(pickerOverlay);
  }
  pickerOverlay = null;
  removeClickableHighlights();

  const selectorData = getCssSelector(e.target);
  browser.storage.local.set({
    pickedSelector: selectorData.path,
    pickedText: selectorData.text || ''
  });
}

function escapeRegexHost(host) {
  return host.replace(/[\\^$+?.()|[\]{}]/g, '\\$&');
}

function matchPatternToRegExp(pattern) {
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

function clickElement(item) {
  const finalSelector = item.type === 'any' ? item.selector : item.type + (item.selector || '');
  if (!finalSelector) return;

  let elements;
  try {
    elements = Array.from(document.querySelectorAll(finalSelector));
  } catch (e) {
    return;
  }

  if (item.targetText) {
    const searchTarget = item.targetText.toLowerCase().trim().replace(/\s+/g, ' ');
    elements = elements.filter(el => {
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
    elements.forEach(el => el.click());
  }
}

function canProcessItem(item) {
  if (!item.matchPattern) return true;
  try {
    const regex = matchPatternToRegExp(item.matchPattern);
    return regex.test(window.location.href);
  } catch (e) {
    return false;
  }
}

function processItem(item) {
  if (canProcessItem(item)) {
    clickElement(item);
  }
}

function startClicker() {
  stopClicker();
  isRunning = true;
  browser.storage.local.set({ startTime: Date.now() });

  browser.storage.local.get(['items', 'interval']).then((res) => {
    const items = res.items || [];
    const globalIntervalMs = (parseFloat(res.interval) || 1.5) * 1000;

    items.forEach(item => {
      if (item.enabled) {
        const itemIntervalMs = item.interval && !isNaN(parseFloat(item.interval))
          ? parseFloat(item.interval) * 1000
          : globalIntervalMs;

        const id = setInterval(() => processItem(item), itemIntervalMs);
        itemIntervalIds.push(id);
      }
    });
  });
}

function stopClicker() {
  isRunning = false;
  itemIntervalIds.forEach(id => clearInterval(id));
  itemIntervalIds = [];
}

browser.storage.onChanged.addListener((changes) => {
  // Restart execution safely if rules update mid-session
  if (isRunning) {
    if (changes.items || changes.interval) {
      startClicker();
    }
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

  document.addEventListener('mouseover', hoverHandler, true);
  document.addEventListener('click', clickHandler, true);
}

browser.runtime.onMessage.addListener((message) => {
  if (message.action === "start") {
    startClicker();
  } else if (message.action === "stop") {
    stopClicker();
  } else if (message.action === "startPicking") {
    startPicker();
  }
});
