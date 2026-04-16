import browser from 'webextension-polyfill';
import { ClickItem, Preset, StorageData } from './types';

export class StorageManager {
  static async getData(): Promise<StorageData> {
    const data = await browser.storage.local.get(null);
    return data as unknown as StorageData;
  }

  static async getItems(): Promise<ClickItem[]> {
    const res = await browser.storage.local.get('items');
    return (res.items as ClickItem[]) || [];
  }

  static async setItems(items: ClickItem[]): Promise<void> {
    await browser.storage.local.set({ items });
  }

  static async getPresets(): Promise<Preset[]> {
    const res = await browser.storage.local.get('presets');
    return (res.presets as Preset[]) || [];
  }

  static async setPresets(presets: Preset[]): Promise<void> {
    await browser.storage.local.set({ presets });
  }

  static async updateIsRunning(isRunning: boolean): Promise<void> {
    await browser.storage.local.set({ isRunning });
  }

  static async getCurrentPresetId(): Promise<string> {
    const res = await browser.storage.local.get('currentPresetId');
    return (res.currentPresetId as string) || 'default';
  }

  static async setCurrentPresetId(id: string): Promise<void> {
    await browser.storage.local.set({ currentPresetId: id });
  }

  static async getOverlayDomains(): Promise<Record<string, boolean>> {
    const res = await browser.storage.local.get('overlayDomains');
    return (res.overlayDomains as Record<string, boolean>) || {};
  }

  static async setOverlayDomain(hostname: string, visible: boolean): Promise<void> {
    const domains = await this.getOverlayDomains();
    await browser.storage.local.set({
      overlayDomains: { ...domains, [hostname]: visible },
    });
  }
}
