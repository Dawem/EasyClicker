export interface ClickItem {
  id: string;
  type: string;
  matchType: string;
  selector: string;
  customName?: string;
  targetText?: string;
  matchPattern: string;
  interval?: string;
  enabled: boolean;
}

export interface Preset {
  id: string;
  name: string;
  items: ClickItem[];
  runMode?: string;
}

export interface StorageData {
  items: ClickItem[];
  presets: Preset[];
  currentPresetId: string;
  isRunning: boolean;
  interval: string;
  startTime: number;
  autoStart: boolean;
  filterDomain: boolean;
  runMode: string;
  overlayDomains: Record<string, boolean>;
  activeSequenceItemId: string | null;
  activeSequenceItemStart: number;
  overlayPositions: Record<string, { x: number; y: number }>;
}
