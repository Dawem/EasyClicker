import { ClickItem, Preset } from '../shared/types';
import { generateConciseTitle, matchPatternToRegExp } from '../shared/utils';

export function createListItem(
  item: ClickItem,
  globalInterval: number,
  onToggle: (id: string, enabled: boolean) => void,
  onEdit: (item: ClickItem) => void,
  onCopy: (item: ClickItem) => void,
  onDelete: (id: string) => void,
): HTMLElement {
  const el = document.createElement('div');
  el.className = 'element-item';
  el.dataset.itemId = item.id;
  el.draggable = true;

  const dragHandle = document.createElement('div');
  dragHandle.className = 'drag-handle';
  dragHandle.innerHTML = '⋮⋮';
  el.appendChild(dragHandle);

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'item-checkbox';
  checkbox.checked = item.enabled;
  checkbox.addEventListener('change', () => onToggle(item.id, checkbox.checked));

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
    extrasDiv.textContent = `Speed: ${item.interval}s`;
    info.appendChild(extrasDiv);
  }

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'icon-btn';
  editBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`;
  editBtn.title = 'Edit';
  editBtn.onclick = () => onEdit(item);

  const copyBtn = document.createElement('button');
  copyBtn.className = 'icon-btn';
  copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
  copyBtn.title = 'Duplicate';
  copyBtn.onclick = () => onCopy(item);

  const removeBtn = document.createElement('button');
  removeBtn.className = 'icon-btn danger';
  removeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  removeBtn.title = 'Remove';
  removeBtn.onclick = () => onDelete(item.id);

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

export function renderList(
  elementList: HTMLElement,
  items: ClickItem[],
  globalInterval: number,
  filterCurrent: boolean,
  currentTabUrl: string,
  callbacks: {
    onToggle: (id: string, enabled: boolean) => void;
    onEdit: (item: ClickItem) => void;
    onCopy: (item: ClickItem) => void;
    onDelete: (id: string) => void;
  },
) {
  elementList.innerHTML = '';

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
    elementList.innerHTML = `<div class="ec-empty-msg">No elements added yet.<br><br>Click "+ Add New Element" to get started.</div>`;
    return;
  }

  if (renderableItems.length === 0 && items.length > 0) {
    if (filterCurrent) {
      elementList.innerHTML = `<div class="ec-empty-msg">No elements match the current domain.</div>`;
    }
    return;
  }

  renderableItems.forEach((item) => {
    elementList.appendChild(
      createListItem(item, globalInterval, callbacks.onToggle, callbacks.onEdit, callbacks.onCopy, callbacks.onDelete),
    );
  });
}

export function renderPresets(selects: HTMLSelectElement[], presets: Preset[], currentPresetId: string) {
  selects.forEach((select) => {
    select.innerHTML = '';
    if (presets.length === 0) {
      const noOpt = document.createElement('option');
      noOpt.value = 'default';
      noOpt.textContent = 'No presets saved';
      noOpt.disabled = true;
      noOpt.selected = true;
      select.appendChild(noOpt);
    } else {
      presets.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        select.appendChild(opt);
      });
      select.value = currentPresetId !== 'default' ? currentPresetId : presets[0].id;
    }
  });
}
