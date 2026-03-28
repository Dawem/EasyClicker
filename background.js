function toggleClickerState(action) {
  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    if (tabs.length > 0) {
      browser.tabs.sendMessage(tabs[0].id, { action }).catch(() => { });
    }
  });
  browser.storage.local.set({ isRunning: action === 'start' });
}

browser.commands.onCommand.addListener((command) => {
  if (command === "start-clicking" || command === "stop-clicking") {
    toggleClickerState(command === "start-clicking" ? "start" : "stop");
  }
});

browser.runtime.onMessage.addListener((message) => {
  if (message.action === "start" || message.action === "stop") {
    toggleClickerState(message.action);
  }
});
