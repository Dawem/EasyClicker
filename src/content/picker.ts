import browser from 'webextension-polyfill';
import { state } from './state';
import { createElement } from '../utils';

export function addClickableHighlights() {
  if (!document.getElementById('ec-clickable-styles')) {
    const style = createElement('style', {
      id: 'ec-clickable-styles',
      textContent: `
      .ec-clickable-element {
        outline: 2px dashed #f59e0b !important;
        outline-offset: -2px !important;
        background-color: rgba(245, 158, 11, 0.2) !important;
      }
    `,
    });
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
    } else if (el.hasAttribute('onclick') || typeof (el as HTMLElement).onclick === 'function') {
      isClickable = true;
    } else if (
      el.hasAttribute('role') &&
      ['button', 'link', 'menuitem', 'tab'].includes(el.getAttribute('role') || '')
    ) {
      isClickable = true;
    } else {
      const computed = window.getComputedStyle(el);
      if (computed.cursor === 'pointer') {
        isClickable = true;
      }
    }

    if (isClickable) {
      el.classList.add('ec-clickable-element');
      state.highlightedClickables.push(el);
    }
  });
}

export function removeClickableHighlights() {
  state.highlightedClickables.forEach((el) => {
    try {
      el.classList.remove('ec-clickable-element');
    } catch (_e) {}
  });
  state.highlightedClickables = [];

  const style = document.getElementById('ec-clickable-styles');
  if (style) style.remove();
}

function cleanText(node: HTMLElement): string | null {
  const text = (node.innerText || node.textContent || '').trim().replace(/\s+/g, ' ');
  if (text.length > 0 && text.length < 60) return text;
  return null;
}

export function isUniqueWithText(selector: string, textToCheck: string | null): boolean {
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

export function getCssSelector(el: HTMLElement): { path: string; text: string | null } {
  if (el.tagName.toLowerCase() == 'html') return { path: 'html', text: null };
  if (el.tagName.toLowerCase() == 'body') return { path: 'body', text: null };

  const getClasses = (node: HTMLElement): string => {
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
          if (getClasses(sibling as HTMLElement) === classes) {
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

    currentEl = currentEl.parentNode as HTMLElement;
  }

  return { path: pathArr.join(' > '), text: usedText ? targetText : null };
}

export function hoverHandler(e: MouseEvent): void {
  if (!state.isPicking) return;

  const target = e.target as HTMLElement;
  if (state.pickerOverlay && target === state.pickerOverlay) return;

  if (state.highlightEl && state.highlightEl !== target) {
    state.highlightEl.style.outline = state.highlightEl.dataset.oldOutline || '';
    state.highlightEl.style.backgroundColor = state.highlightEl.dataset.oldBg || '';
    if (!state.highlightEl.dataset.oldOutline) state.highlightEl.style.removeProperty('outline');
    if (!state.highlightEl.dataset.oldBg) state.highlightEl.style.removeProperty('background-color');
  }

  if (state.highlightEl !== target) {
    state.highlightEl = target;
    state.highlightEl.dataset.oldOutline = state.highlightEl.style.outline;
    state.highlightEl.dataset.oldBg = state.highlightEl.style.backgroundColor;

    state.highlightEl.style.setProperty('outline', '2px solid #ef4444', 'important');
    state.highlightEl.style.setProperty('background-color', 'rgba(239, 68, 68, 0.2)', 'important');
  }

  if (state.pickerOverlay) {
    const tagName = state.highlightEl.tagName.toLowerCase();
    const id = state.highlightEl.id ? `#${state.highlightEl.id}` : '';
    let classes = '';

    if (typeof state.highlightEl.className === 'string' && state.highlightEl.className.trim() !== '') {
      classes = '.' + state.highlightEl.className.trim().split(/\s+/).join('.');
    }

    const textPreview = state.highlightEl.innerText
      ? `\nText: "${state.highlightEl.innerText.substring(0, 40)}${state.highlightEl.innerText.length > 40 ? '...' : ''}"`
      : '';

    state.pickerOverlay.innerText = `<${tagName}${id}${classes}>${textPreview}`;

    const rect = state.pickerOverlay.getBoundingClientRect();
    let left = e.clientX + 15;
    let top = e.clientY + 15;

    if (left + rect.width > window.innerWidth) {
      left = e.clientX - rect.width - 15;
    }
    if (top + rect.height > window.innerHeight) {
      top = e.clientY - rect.height - 15;
    }

    state.pickerOverlay.style.left = Math.max(0, left) + 'px';
    state.pickerOverlay.style.top = Math.max(0, top) + 'px';
  }
}

export function clickHandler(e: MouseEvent): void {
  if (!state.isPicking) return;
  if (!e.isTrusted) return;
  e.preventDefault();
  e.stopPropagation();

  state.isPicking = false;

  if (state.highlightEl) {
    state.highlightEl.style.outline = state.highlightEl.dataset.oldOutline || '';
    state.highlightEl.style.backgroundColor = state.highlightEl.dataset.oldBg || '';
  }

  document.removeEventListener('mouseover', hoverHandler as EventListener, true);
  document.removeEventListener('click', clickHandler as EventListener, true);

  if (state.pickerOverlay && state.pickerOverlay.parentNode) {
    state.pickerOverlay.parentNode.removeChild(state.pickerOverlay);
  }
  state.pickerOverlay = null;
  removeClickableHighlights();

  const selectorData = getCssSelector(e.target as HTMLElement);
  browser.storage.local.set({
    pickedSelector: selectorData.path,
    pickedText: selectorData.text || '',
  });
}

export function startPicker() {
  state.isPicking = true;

  if (!state.pickerOverlay) {
    state.pickerOverlay = createElement(
      'div',
      {},
      {
        position: 'fixed',
        zIndex: '2147483647',
        backgroundColor: '#1e293b',
        color: '#f8fafc',
        padding: '8px 12px',
        borderRadius: '6px',
        fontSize: '12px',
        fontFamily: 'monospace',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        pointerEvents: 'none',
        border: '1px solid #3b82f6',
        whiteSpace: 'pre-wrap',
        maxWidth: '300px',
        wordBreak: 'break-all',
      },
    );
    document.body.appendChild(state.pickerOverlay);
  }

  addClickableHighlights();

  document.addEventListener('mouseover', hoverHandler as EventListener, true);
  document.addEventListener('click', clickHandler as EventListener, true);
}
