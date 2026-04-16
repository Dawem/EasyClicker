import { ClickItem } from './types';

let isRunning = false;
let itemIntervalIds: number[] = [];
let activeSequenceItemId: string | null = null;
let activeSequenceItemStart: number = 0;
let globalStartTime: number = 0;
let currentRunMode: 'sequence' | 'parallel' = 'sequence';
let globalInterval: number = 1.0;

export function stopClicker() {
  isRunning = false;
  itemIntervalIds.forEach(clearInterval);
  itemIntervalIds = [];
  activeSequenceItemId = null;
}

function clickElement(item: ClickItem) {
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
      const innerText = ((el as HTMLElement).innerText || '').toLowerCase().replace(/\s+/g, ' ');
      const textContent = (el.textContent || '').toLowerCase().replace(/\s+/g, ' ');
      return innerText.includes(searchTarget) || textContent.includes(searchTarget);
    });
  }

  if (elements.length === 0) return;

  const matchType = item.matchType || 'first';

  if (matchType === 'first') {
    (elements[0] as HTMLElement).click();
  } else if (matchType === 'last') {
    (elements[elements.length - 1] as HTMLElement).click();
  } else if (matchType === 'all') {
    elements.forEach((el) => (el as HTMLElement).click());
  }
}

export function startClicker(items: ClickItem[], mode: 'sequence' | 'parallel', interval: number) {
  stopClicker();
  isRunning = true;
  currentRunMode = mode;
  globalInterval = interval;
  globalStartTime = Date.now();

  const activeItems = items.filter((i) => i.enabled);
  if (activeItems.length === 0) return;

  if (mode === 'sequence') {
    let currentIndex = 0;

    const runNext = () => {
      if (!isRunning) return;
      const item = activeItems[currentIndex];
      activeSequenceItemId = item.id;
      activeSequenceItemStart = Date.now();

      clickElement(item);

      const delay = item.interval && !isNaN(parseFloat(item.interval)) 
        ? parseFloat(item.interval) * 1000 
        : interval * 1000;

      currentIndex = (currentIndex + 1) % activeItems.length;
      itemIntervalIds.push(window.setTimeout(runNext, delay) as unknown as number);
    };

    runNext();
  } else {
    activeItems.forEach((item) => {
      const delay = item.interval && !isNaN(parseFloat(item.interval)) 
        ? parseFloat(item.interval) * 1000 
        : interval * 1000;
        
      const id = window.setInterval(() => clickElement(item), delay) as unknown as number;
      itemIntervalIds.push(id);
    });
  }
}

export function getExecutionState() {
  return {
    isRunning,
    activeSequenceItemId,
    activeSequenceItemStart,
    globalStartTime,
    currentRunMode,
    globalInterval
  };
}
