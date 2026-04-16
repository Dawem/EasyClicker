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
  runMode?: 'sequence' | 'parallel';
}

export interface StorageData {
  items?: ClickItem[];
  presets?: Preset[];
  currentPresetId?: string;
  isRunning?: boolean;
  interval?: number;
  startTime?: number;
  autoStart?: boolean;
  filterDomain?: boolean;
  runMode?: 'sequence' | 'parallel';
  overlayDomains?: Record<string, boolean>;
  activeSequenceItemId?: string | null;
  activeSequenceItemStart?: number;
  overlayPosX?: number;
  overlayPosY?: number;
  draftItem?: Partial<ClickItem> & { editId?: string };
  pickedSelector?: string;
  pickedText?: string;
}
