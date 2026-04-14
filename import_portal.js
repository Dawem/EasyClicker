if (typeof browser === "undefined") {
  globalThis.browser = chrome;
}

const fileInput = document.getElementById('fileInput');
const statusDiv = document.getElementById('status');
const titleEl = document.getElementById('title');
const descEl = document.getElementById('desc');

const urlParams = new URLSearchParams(window.location.search);
const importType = urlParams.get('type') || 'all';

if (importType === 'single') {
  titleEl.innerText = 'Import Single Preset';
  descEl.innerText = 'Select a single JSON preset file to add to your collection.';
} else {
  titleEl.innerText = 'Import All Presets';
  descEl.innerText = 'Select a JSON file containing all your presets. This will replace your current collection.';
}

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(evt) {
    try {
      const parsed = JSON.parse(evt.target.result);
      const res = await browser.storage.local.get(['presets', 'items']);
      let presets = res.presets || [];
      
      if (importType === 'single') {
        if (parsed && parsed.id && parsed.name && Array.isArray(parsed.items)) {
          // Single import logic
          parsed.id = Date.now().toString();
          let newName = parsed.name;
          let copyNum = 1;
          while (presets.some(p => p.name === newName)) {
            newName = `${parsed.name} (${copyNum})`;
            copyNum++;
          }
          parsed.name = newName;
          presets.push(parsed);
          
          await browser.storage.local.set({ 
            presets: presets,
            currentPresetId: parsed.id,
            items: JSON.parse(JSON.stringify(parsed.items)),
            isRunning: false
          });
          if (parsed.runMode) await browser.storage.local.set({ runMode: parsed.runMode });
          
          statusDiv.innerText = 'Successfully imported single preset!';
          statusDiv.style.color = '#4ade80';
          setTimeout(() => window.close(), 1000);
        } else {
          showError('Invalid single preset file format.');
        }
      } else {
        // Bulk import logic
        if (Array.isArray(parsed)) {
          await browser.storage.local.set({ 
            presets: parsed,
            currentPresetId: 'default',
            isRunning: false
          });
          statusDiv.innerText = 'Successfully imported all presets!';
          statusDiv.style.color = '#4ade80';
          setTimeout(() => window.close(), 1000);
        } else {
          showError('Invalid bulk presets file format (should be an array).');
        }
      }
    } catch (err) {
      showError('Failed to parse JSON file.');
    }
  };
  reader.readAsText(file);
});

function showError(msg) {
  statusDiv.innerText = msg;
  statusDiv.style.color = '#ef4444';
}
