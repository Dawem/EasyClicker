import browser from 'webextension-polyfill';
import { StorageData } from './types';

const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const statusDiv = document.getElementById('status') as HTMLElement;
const titleEl = document.getElementById('title') as HTMLElement;
const descEl = document.getElementById('desc') as HTMLElement;

const urlParams = new URLSearchParams(window.location.search);
const importType = urlParams.get('type') || 'all';

if (importType === 'single') {
  titleEl.innerText = 'Import Single Preset';
  descEl.innerText = 'Select a single JSON preset file to add to your collection.';
} else {
  titleEl.innerText = 'Import All Presets';
  descEl.innerText = 'Select a JSON file containing multiple presets to add to your collection.';
}

fileInput.addEventListener('change', (e: Event) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function (evt: ProgressEvent<FileReader>) {
    try {
      const parsed = JSON.parse(evt.target?.result as string);
      const res = (await browser.storage.local.get(['presets', 'items'])) as Partial<StorageData>;
      const presets = res.presets || [];

      if (importType === 'single') {
        if (parsed && parsed.id && parsed.name && Array.isArray(parsed.items)) {
          // Single import logic
          parsed.id = Date.now().toString();
          let newName = parsed.name;
          let copyNum = 1;
          while (presets.some((p) => p.name === newName)) {
            newName = `${parsed.name} (${copyNum})`;
            copyNum++;
          }
          parsed.name = newName;
          presets.push(parsed);

          await browser.storage.local.set({
            presets: presets,
            currentPresetId: parsed.id,
            items: JSON.parse(JSON.stringify(parsed.items)),
            isRunning: false,
          });
          if (parsed.runMode) await browser.storage.local.set({ runMode: parsed.runMode });

          statusDiv.innerText = 'Successfully imported single preset!';
          statusDiv.style.color = '#4ade80';
          setTimeout(() => window.close(), 1000);
        } else {
          showError('Invalid single preset file format.');
        }
      } else {
        // Bulk import logic - append rather than replace
        if (Array.isArray(parsed)) {
          let firstNewId: string | null = null;
          parsed.forEach((importedPreset, idx) => {
            if (!importedPreset.name || !Array.isArray(importedPreset.items)) return;

            const newId = Date.now().toString() + '_' + idx;
            if (!firstNewId) firstNewId = newId;

            let newName = importedPreset.name;
            let copyNum = 1;
            while (presets.some((p) => p.name === newName)) {
              newName = `${importedPreset.name} (${copyNum})`;
              copyNum++;
            }

            presets.push({
              ...importedPreset,
              id: newId,
              name: newName,
            });
          });

          await browser.storage.local.set({
            presets: presets,
            isRunning: false,
          });
          statusDiv.innerText = `Successfully added ${parsed.length} presets!`;
          statusDiv.style.color = '#4ade80';
          setTimeout(() => window.close(), 1000);
        } else {
          showError('Invalid bulk presets file format (should be an array).');
        }
      }
    } catch (_err) {
      showError('Failed to parse JSON file.');
    }
  };
  reader.readAsText(file);
});

function showError(msg: string) {
  statusDiv.innerText = msg;
  statusDiv.style.color = '#ef4444';
}
