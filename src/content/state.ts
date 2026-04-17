import { ClickItem, Preset } from '../types';

export const state = {
  itemIntervalIds: [] as number[],
  isRunning: false,
  isPicking: false,
  highlightEl: null as HTMLElement | null,
  pickerOverlay: null as HTMLElement | null,
  highlightedClickables: [] as HTMLElement[],

  sequenceStopFlag: false,
  currentSequenceTimer: null as number | null,
  currentSequenceResolve: null as (() => void) | null,
  sequenceId: 0,
  currentRunMode: 'sequence',
  activeSequenceItemId: null as string | null,
  activeSequenceItemStart: 0,

  currentOverlayItems: [] as ClickItem[],
  isOverlayVisible: false,
  pageOverlayEl: null as HTMLElement | null,
  globalInterval: 1.5,
  globalStartTime: 0,
  rafId: null as number | null,
  overlayPresets: [] as Preset[],
  overlayCurrentPresetId: 'default',
  overlayPosX: -1,
  overlayPosY: -1,
  overlayPositions: {} as Record<string, { x: number; y: number }>,
  isPinnedRight: false,
  isPinnedBottom: false,

  dragStartX: 0,
  dragStartY: 0,
};
