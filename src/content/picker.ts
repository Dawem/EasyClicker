import browser from 'webextension-polyfill';

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
    } else if (el.hasAttribute('role')) {
      const role = el.getAttribute('role');
      if (role && ['button', 'link', 'menuitem', 'tab'].includes(role)) {
        isClickable = true;
      }
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

function isUniqueWithText(selector: string, textToCheck: string | null) {
  try {
    const els = Array.from(document.querySelectorAll(selector));
    if (els.length === 1 && !textToCheck) return true;
    if (textToCheck) {
      const searchTarget = textToCheck.toLowerCase();
      const filtered = els.filter((n) => {
        const it = ((n as HTMLElement).innerText || '').toLowerCase().replace(/\s+/g, ' ');
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

function getCssSelector(el: HTMLElement) {
  if (el.tagName.toLowerCase() == 'html') return { path: 'html', text: null };
  if (el.tagName.toLowerCase() == 'body') return { path: 'body', text: null };

  const getClasses = (node: HTMLElement) => {
    if (typeof node.className !== 'string' || !node.className.trim()) return '';
    const classes = node.className
      .trim()
      .split(/\s+/)
      .filter((c: string) => c && !c.includes(':') && !c.includes('['));
    return classes.length ? '.' + classes.map((c: string) => CSS.escape(c)).join('.') : '';
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

  const pathArr = [];
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
          if (getClasses(sibling as HTMLElement) === classes) {
            needsNth = true;
          }
        }
        if (sibling === currentEl) break;
        if (sibling.tagName.toLowerCase() === currentEl.tagName.toLowerCase()) nth++;
        sibling = (sibling as HTMLElement).nextElementSibling;
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

    currentEl = currentEl.parentNode as HTMLElement;
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

export function startPicking() {
  if (isPicking) return;
  isPicking = true;

  addClickableHighlights();

  pickerOverlay = document.createElement('div');
  Object.assign(pickerOverlay.style, {
    position: 'fixed',
    zIndex: '2147483647',
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    color: '#f8fafc',
    padding: '8px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontFamily: 'monospace',
    pointerEvents: 'none',
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
    border: '1px solid #334155',
    whiteSpace: 'pre-wrap',
    maxWidth: '300px',
  });
  document.body.appendChild(pickerOverlay);

  document.addEventListener('mouseover', hoverHandler as any, true);
  document.addEventListener('click', clickHandler as any, true);
}
