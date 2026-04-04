if (typeof browser === "undefined") {
  globalThis.browser = chrome;
}

function toggleClickerState(action) {
  const updates = { isRunning: action === 'start' };
  if (action === 'start') updates.startTime = Date.now();
  browser.storage.local.set(updates);
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
