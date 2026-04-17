import browser from 'webextension-polyfill';
import { state } from './state';
import { canProcessItem } from './runner';
import { generateConciseTitle, createElement } from '../utils';

export function enforceOverlayBounds() {
  if (!state.pageOverlayEl) return;
  const rect = state.pageOverlayEl.getBoundingClientRect();
  const SNAP_DIST = 20;

  state.isPinnedRight = false;
  state.isPinnedBottom = false;

  if (state.overlayPosX < SNAP_DIST) {
    state.overlayPosX = 0;
  } else if (window.innerWidth - (state.overlayPosX + rect.width) < SNAP_DIST) {
    state.overlayPosX = window.innerWidth - rect.width;
    state.isPinnedRight = true;
  }

  if (state.overlayPosY < SNAP_DIST) {
    state.overlayPosY = 0;
  } else if (window.innerHeight - (state.overlayPosY + rect.height) < SNAP_DIST) {
    state.overlayPosY = window.innerHeight - rect.height;
    state.isPinnedBottom = true;
  }

  if (state.overlayPosX < 0) state.overlayPosX = 0;
  if (state.overlayPosY < 0) state.overlayPosY = 0;
  if (state.overlayPosX + rect.width > window.innerWidth) state.overlayPosX = window.innerWidth - rect.width;
  if (state.overlayPosY + rect.height > window.innerHeight) state.overlayPosY = window.innerHeight - rect.height;

  state.pageOverlayEl.style.left = state.overlayPosX + 'px';
  state.pageOverlayEl.style.top = state.overlayPosY + 'px';
  state.pageOverlayEl.style.right = 'auto';
  state.pageOverlayEl.style.bottom = 'auto';
}

window.addEventListener('resize', () => {
  if (state.isOverlayVisible && state.pageOverlayEl) {
    const rect = state.pageOverlayEl.getBoundingClientRect();
    if (state.isPinnedRight) state.overlayPosX = window.innerWidth - rect.width;
    if (state.isPinnedBottom) state.overlayPosY = window.innerHeight - rect.height;
    enforceOverlayBounds();
  }
});

export function updateProgressBars() {
  if (!state.pageOverlayEl || !state.isRunning) return;
  const now = Date.now();
  const els = state.pageOverlayEl.querySelectorAll('.element-item');
  els.forEach((el) => {
    const bar = el.querySelector('.progress-bar') as HTMLElement;
    if (!bar) return;
    const isEnabled = (el.querySelector('input[type="checkbox"]') as HTMLInputElement).checked;

    if (!isEnabled) {
      if (bar.classList.contains('ec-fast-mode')) bar.classList.remove('ec-fast-mode');
      bar.style.width = '0%';
      return;
    }

    if (state.currentRunMode === 'sequence') {
      const itemId = (el as HTMLElement).dataset.itemId;
      if (itemId === state.activeSequenceItemId) {
        const itemIntervalMs = (el as HTMLElement).dataset.intervalMs
          ? parseFloat((el as HTMLElement).dataset.intervalMs as string)
          : state.globalInterval * 1000;
        const elapsed = now - state.activeSequenceItemStart;
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
        : state.globalInterval * 1000;
      if (itemIntervalMs < 100) {
        if (!bar.classList.contains('ec-fast-mode')) bar.classList.add('ec-fast-mode');
      } else {
        if (bar.classList.contains('ec-fast-mode')) bar.classList.remove('ec-fast-mode');
        const elapsed = now - state.globalStartTime;
        if (elapsed < 0) return;
        const progress = (elapsed % itemIntervalMs) / itemIntervalMs;
        bar.style.width = `${progress * 100}%`;
      }
    }
  });
  state.rafId = requestAnimationFrame(updateProgressBars);
}

function initDrag(headerEl: HTMLElement, containerEl: HTMLElement): void {
  let isDragging = false;

  headerEl.addEventListener('mousedown', (e: MouseEvent) => {
    if ((e.target as HTMLElement).tagName.toLowerCase() === 'div' && (e.target as HTMLElement).innerText === '×')
      return;
    isDragging = true;
    state.dragStartX = e.clientX - state.overlayPosX;
    state.dragStartY = e.clientY - state.overlayPosY;
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    state.overlayPosX = e.clientX - state.dragStartX;
    state.overlayPosY = e.clientY - state.dragStartY;
    containerEl.style.left = state.overlayPosX + 'px';
    containerEl.style.top = state.overlayPosY + 'px';
    containerEl.style.right = 'auto';
    containerEl.style.bottom = 'auto';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.userSelect = '';
      enforceOverlayBounds();

      state.overlayPositions = {
        ...state.overlayPositions,
        [window.location.hostname]: { x: state.overlayPosX, y: state.overlayPosY },
      };
      browser.storage.local.set({ overlayPositions: state.overlayPositions });
    }
  });
}

export function updatePageOverlay() {
  if (!state.isOverlayVisible) {
    if (state.pageOverlayEl) {
      state.pageOverlayEl.remove();
      state.pageOverlayEl = null;
    }
    if (state.rafId) cancelAnimationFrame(state.rafId);
    return;
  }

  if (!state.pageOverlayEl) {
    if (!document.getElementById('ec-overlay-styles')) {
      const style = createElement('style', {
        id: 'ec-overlay-styles',
        textContent: `
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
      `,
      });
      document.head.appendChild(style);
    }

    state.pageOverlayEl = createElement(
      'div',
      { id: 'ec-page-overlay' },
      {
        position: 'fixed',
        left: (state.overlayPosX === -1 ? window.innerWidth - 300 - 20 : state.overlayPosX) + 'px',
        top: (state.overlayPosY === -1 ? 20 : state.overlayPosY) + 'px',
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
      },
    );
    if (state.overlayPosX === -1 || state.overlayPosY === -1) {
      state.overlayPosX = window.innerWidth - 300 - 20;
      state.overlayPosY = 20;
    }
    document.body.appendChild(state.pageOverlayEl);
    enforceOverlayBounds();
  }

  state.pageOverlayEl.innerHTML = '';

  const header = createElement(
    'div',
    {
      onmousedown: () => (header.style.cursor = 'grabbing'),
      onmouseup: () => (header.style.cursor = 'grab'),
    },
    {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      cursor: 'grab',
      paddingBottom: '4px',
      borderBottom: '1px solid #334155',
    },
  );

  initDrag(header, state.pageOverlayEl);

  const title = createElement(
    'div',
    { innerText: 'Easy Clicker' },
    {
      fontWeight: '700',
      fontSize: '14px',
      lineHeight: '1',
    },
  );

  const closeBtnWrap = createElement(
    'div',
    {},
    {
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '4px',
      backgroundColor: 'transparent',
      width: '18px',
      height: '18px',
    },
  );

  closeBtnWrap.onmouseover = () => (closeBtnWrap.style.backgroundColor = 'rgba(255,255,255,0.1)');
  closeBtnWrap.onmouseout = () => (closeBtnWrap.style.backgroundColor = 'transparent');
  closeBtnWrap.onclick = () => {
    browser.storage.local.get(['overlayDomains']).then((res) => {
      browser.storage.local.set({
        overlayDomains: {
          ...((res.overlayDomains as Record<string, boolean>) || {}),
          [window.location.hostname]: false,
        },
      });
    });
  };

  const closeBtn = createElement(
    'div',
    { innerText: '×' },
    {
      fontSize: '20px',
      lineHeight: '1',
      color: '#94a3b8',
      fontWeight: 'bold',
      paddingBottom: '2px',
    },
  );
  closeBtnWrap.appendChild(closeBtn);

  header.appendChild(title);
  header.appendChild(closeBtnWrap);
  state.pageOverlayEl.appendChild(header);

  const listContainer = createElement(
    'div',
    {},
    {
      flex: '1',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      maxHeight: '250px',
      border: '1px solid #334155',
      borderRadius: '6px',
      padding: '8px',
      background: '#0f172a',
      scrollbarWidth: 'thin',
      scrollbarColor: '#334155 transparent',
    },
  );

  const filteredOverlayItems = state.currentOverlayItems.filter((item) => canProcessItem(item));

  if (filteredOverlayItems.length === 0) {
    const emptyMsg = createElement(
      'div',
      { innerText: state.currentOverlayItems.length > 0 ? 'No matching elements on this page' : 'No elements added' },
      {
        color: '#94a3b8',
        textAlign: 'center',
        padding: '10px 0',
        fontSize: '11px',
      },
    );
    listContainer.appendChild(emptyMsg);
  } else {
    filteredOverlayItems.forEach((item) => {
      const itemRow = createElement(
        'div',
        { className: 'element-item' },
        {
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          paddingBottom: '4px',
        },
      );
      const itemIntervalMs =
        item.interval && !isNaN(parseFloat(item.interval))
          ? parseFloat(item.interval) * 1000
          : state.globalInterval * 1000;
      itemRow.dataset.intervalMs = itemIntervalMs.toString();
      itemRow.dataset.itemId = item.id;

      const elSection = createElement(
        'div',
        {},
        {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        },
      );

      const cb = createElement(
        'input',
        {
          type: 'checkbox',
          checked: item.enabled,
        },
        {
          cursor: 'pointer',
          width: '14px',
          height: '14px',
          margin: '0',
          flexShrink: '0',
        },
      );
      cb.onchange = () => {
        item.enabled = cb.checked;
        browser.storage.local.set({ items: state.currentOverlayItems });
      };

      const fullSel = item.type === 'any' ? item.selector : item.type + (item.selector || '');
      const name = createElement(
        'div',
        {
          innerText: item.customName ? item.customName : generateConciseTitle(item, fullSel),
          title: fullSel,
        },
        {
          flex: '1',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: '12px',
        },
      );

      elSection.appendChild(cb);
      elSection.appendChild(name);
      itemRow.appendChild(elSection);

      const pbContainer = createElement(
        'div',
        {},
        {
          position: 'absolute',
          bottom: '0',
          left: '0',
          width: '100%',
          height: '2px',
          background: 'transparent',
        },
      );
      const pb = createElement(
        'div',
        { className: 'progress-bar' },
        {
          height: '100%',
          background: '#3b82f6',
          width: '0%',
          transition: 'none',
        },
      );
      pbContainer.appendChild(pb);
      itemRow.appendChild(pbContainer);

      listContainer.appendChild(itemRow);
    });
  }

  state.pageOverlayEl.appendChild(listContainer);

  const presetRow = createElement(
    'div',
    {},
    {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      marginBottom: '8px',
      marginTop: '4px',
    },
  );

  const presetLabel = createElement(
    'div',
    { innerText: 'Preset:' },
    { color: '#94a3b8', fontSize: '11px', fontWeight: '500', whiteSpace: 'nowrap' },
  );

  const overlayPresetSelect = createElement(
    'select',
    {},
    {
      flex: '1',
      background: '#1e293b',
      color: '#f8fafc',
      border: '1px solid #334155',
      borderRadius: '4px',
      padding: '2px 4px',
      fontSize: '11px',
      cursor: 'pointer',
      outline: 'none',
    },
  );

  if (state.overlayPresets.length === 0) {
    const noOpt = createElement('option', {
      value: 'default',
      innerText: 'No presets saved',
      disabled: true,
      selected: true,
    });
    overlayPresetSelect.appendChild(noOpt);
  } else {
    state.overlayPresets.forEach((p) => {
      const opt = createElement('option', {
        value: p.id,
        innerText: p.name,
      });
      overlayPresetSelect.appendChild(opt);
    });
    overlayPresetSelect.value =
      state.overlayCurrentPresetId !== 'default' ? state.overlayCurrentPresetId : state.overlayPresets[0].id;
  }

  overlayPresetSelect.onchange = () => {
    const selectedId = overlayPresetSelect.value;
    if (selectedId !== 'default') {
      const p = state.overlayPresets.find((x) => x.id === selectedId);
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
    state.overlayCurrentPresetId = selectedId;
  };

  presetRow.appendChild(presetLabel);
  presetRow.appendChild(overlayPresetSelect);
  state.pageOverlayEl.appendChild(presetRow);

  const controls = createElement('div', {}, { display: 'flex', gap: '8px' });

  const toggleBtn = createElement(
    'button',
    {
      innerText: state.isRunning ? 'Stop' : 'Start',
    },
    {
      width: '100%',
      flex: '1',
      padding: '8px',
      border: 'none',
      borderRadius: '4px',
      color: 'white',
      cursor: 'pointer',
      fontWeight: '600',
      fontSize: '13px',
      backgroundColor: state.isRunning ? '#ef4444' : '#3b82f6',
      transition: 'all 0.2s',
    },
  );

  toggleBtn.onmouseover = () => (toggleBtn.style.backgroundColor = state.isRunning ? '#dc2626' : '#2563eb');
  toggleBtn.onmouseout = () => (toggleBtn.style.backgroundColor = state.isRunning ? '#ef4444' : '#3b82f6');
  toggleBtn.onclick = () => {
    browser.runtime.sendMessage({ action: state.isRunning ? 'stop' : 'start' });
  };

  controls.appendChild(toggleBtn);
  state.pageOverlayEl.appendChild(controls);

  if (state.isRunning) {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = window.requestAnimationFrame(updateProgressBars);
  }

  if (state.pageOverlayEl) {
    const rect = state.pageOverlayEl.getBoundingClientRect();
    if (state.isPinnedRight) state.overlayPosX = window.innerWidth - rect.width;
    if (state.isPinnedBottom) state.overlayPosY = window.innerHeight - rect.height;
    enforceOverlayBounds();
  }
}
