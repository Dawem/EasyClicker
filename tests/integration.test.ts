import browser from 'webextension-polyfill';

describe('Integration: Storage to Content Script', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    document.body.innerHTML = '<div id="test-container"><button id="test-btn">Click Me</button></div>';
  });

  it('should react to storage changes and start/stop clicker state', async () => {
    const mockState = {
      isRunning: false,
      items: [{ id: '1', selector: '#test-btn', enabled: true, matchPattern: '.*', type: 'any', matchType: 'first' }],
      overlayDomains: { localhost: true },
      presets: [],
      currentPresetId: 'default',
      interval: '1.5',
      startTime: Date.now(),
      runMode: 'sequence',
      activeSequenceItemId: null,
      activeSequenceItemStart: 0,
      overlayPositions: {},
    };

    (browser.storage.local.get as jest.Mock).mockResolvedValue(mockState);

    await import('../src/content');

    await new Promise((resolve) => setTimeout(resolve, 0));

    const overlay = document.getElementById('ec-page-overlay');
    expect(overlay).not.toBeNull();

    const onChangedCallback = (browser.storage.onChanged.addListener as jest.Mock).mock.calls[0][0];

    onChangedCallback(
      {
        isRunning: { newValue: true, oldValue: false },
      },
      'local',
    );

    const startBtn = Array.from(overlay!.querySelectorAll('button')).find((b) => b.innerText === 'Stop');
    expect(startBtn).toBeDefined();
  });

  it('should start picker when receiving startPicking message', async () => {
    (browser.storage.local.get as jest.Mock).mockResolvedValue({
      overlayDomains: { localhost: true },
    });

    await import('../src/content');
    await new Promise((resolve) => setTimeout(resolve, 0));

    const onMessageCallback = (browser.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];
    onMessageCallback({ action: 'startPicking' });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const allDivs = Array.from(document.querySelectorAll('div'));
    const pickerOverlay = allDivs.find((d) => d.style.position === 'fixed' && d.style.zIndex === '2147483647');

    expect(pickerOverlay).toBeDefined();
    expect(pickerOverlay?.style.backgroundColor).toContain('rgb(30, 41, 59)');
  });

  it('should toggle clicker state in background script via messages', async () => {
    await import('../src/background');
    const onMessageCallback = (browser.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];

    onMessageCallback({ action: 'start' });
    expect(browser.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({ isRunning: true }));

    onMessageCallback({ action: 'stop' });
    expect(browser.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({ isRunning: false }));
  });

  it('should toggle clicker state in background script via commands', async () => {
    await import('../src/background');
    const onCommandCallback = (browser.commands.onCommand.addListener as jest.Mock).mock.calls[0][0];

    onCommandCallback('start-clicking');
    expect(browser.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({ isRunning: true }));

    onCommandCallback('stop-clicking');
    expect(browser.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({ isRunning: false }));
  });
});
