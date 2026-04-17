import { ClickItem, Preset } from '../types';

export const state = {
  items: [] as ClickItem[],
  defaultMatchPattern: '',
  currentTabUrl: '',
  isRenaming: false,

  presets: [] as Preset[],
  currentPresetId: 'default',

  rafId: null as number | null,
  globalIsRunning: false,
  globalInterval: 1.5,
  globalStartTime: 0,
  runMode: 'sequence',

  activeSequenceItemId: null as string | null,
  activeSequenceItemStart: 0,
};
