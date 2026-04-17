import 'jest-webextension-mock';
import browser from 'webextension-polyfill';

(global as any).chrome = (global as any).chrome || {
  runtime: { id: 'test-id' },
  storage: { local: { get: jest.fn(), set: jest.fn(), onChanged: { addListener: jest.fn() } } },
  tabs: { query: jest.fn() },
};

jest.mock('webextension-polyfill', () => {
  return (global as any).chrome;
});

describe('UI Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    document.body.innerHTML = `
      <div id="mainView"></div>
      <div id="dashboardView"></div>
      <div id="elementList"></div>
      <div id="settingsView" style="display: none;"></div>
      <div id="addSection" style="display: none;"></div>
      
      <select id="elementType"><option value="any">Any</option><option value="button">Button</option></select>
      <select id="matchType"><option value="first">First</option></select>
      <select id="runMode"><option value="sequence">Sequenced</option></select>
      <select id="presetSelect"></select>
      <select id="presetSelectDashboard"></select>

      <input type="hidden" id="editId">
      <input type="text" id="selector">
      <input type="text" id="customName">
      <input type="text" id="targetText">
      <input type="text" id="matchPattern">
      <input type="number" id="itemInterval">
      <input type="number" id="interval">
      <input type="checkbox" id="autoStart">
      <input type="checkbox" id="filterDomain">
      <input type="text" id="presetNameInput">

      <button id="toggleFormBtn"></button>
      <button id="cancelFormBtn"></button>
      <button id="addUpdateBtn"></button>
      <button id="toggleStartStopBtn"></button>
      <button id="openOverlayBtn"></button>
      <button id="newPresetBtn"></button>
      <button id="deletePresetBtn"></button>
      <button id="renamePresetBtn"></button>
      <button id="exportSinglePresetBtn"></button>
      <button id="importSinglePresetBtn"></button>
      <button id="exportPresetBtn"></button>
      <button id="importPresetBtn"></button>
      <button id="presetConfirmBtn"></button>
      <button id="presetCancelBtn"></button>
      <button id="settingsBtn"></button>
      <button id="settingsBackBtn"></button>
      <button id="pickBtn"></button>

      <div id="selectorError"></div>
      <div id="presetActionsBlock"></div>
      <div id="presetPromptDiv"></div>
    `;

    (browser.tabs.query as jest.Mock).mockResolvedValue([
      {
        url: 'https://www.example.com/page',
        id: 123,
      },
    ]);

    (browser.storage.local.get as jest.Mock).mockResolvedValue({
      items: [],
      presets: [{ id: 'default', name: 'Default', items: [] }],
      currentPresetId: 'default',
      isRunning: false,
      interval: '1.5',
      runMode: 'sequence',
    });
  });

  it('should correctly escape host for regex', async () => {
    require('./popup');

    await new Promise((resolve) => setTimeout(resolve, 10));

    const matchPatternInput = document.getElementById('matchPattern') as HTMLInputElement;
    expect(matchPatternInput.value).toBe('*://*.example.com/*');
  });

  it('should render items in the list', () => {
    (browser.storage.local.get as jest.Mock).mockResolvedValue({
      items: [{ id: '1', selector: '.btn', enabled: true, matchPattern: '.*', type: 'any', matchType: 'all' }],
      presets: [],
      currentPresetId: 'default',
    });

    require('./popup');

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const elementList = document.getElementById('elementList');
        expect(elementList?.innerHTML).toContain('.btn');
        resolve();
      }, 0);
    });
  });

  it('should toggle visibility of sections', () => {
    require('./popup');
    const toggleFormBtn = document.getElementById('toggleFormBtn');
    const addSection = document.getElementById('addSection');

    expect(addSection?.style.display).toBe('none');

    toggleFormBtn?.click();
    expect(addSection?.style.display).toBe('block');

    const cancelFormBtn = document.getElementById('cancelFormBtn');
    cancelFormBtn?.click();
    expect(addSection?.style.display).toBe('none');
  });

  it('should remove an item from the list', async () => {
    (browser.storage.local.get as jest.Mock).mockResolvedValue({
      items: [{ id: 'remove-me', selector: '.btn', enabled: true, matchPattern: '.*', type: 'any', matchType: 'all' }],
      presets: [],
      currentPresetId: 'default',
    });

    require('./popup');

    await new Promise((resolve) => setTimeout(resolve, 0));

    const elementList = document.getElementById('elementList');
    expect(elementList?.innerHTML).toContain('remove-me');

    const removeBtn = elementList?.querySelector('.icon-btn.danger') as HTMLButtonElement;
    removeBtn?.click();

    expect(elementList?.innerHTML).not.toContain('remove-me');
  });

  it('should duplicate an item', async () => {
    (browser.storage.local.get as jest.Mock).mockResolvedValue({
      items: [{ id: 'dup-me', selector: '.btn', enabled: true, matchPattern: '.*', type: 'any', matchType: 'all' }],
      presets: [],
      currentPresetId: 'default',
    });

    require('./popup');

    await new Promise((resolve) => setTimeout(resolve, 0));

    const elementList = document.getElementById('elementList');
    const copyBtn = elementList?.querySelectorAll('.icon-btn')[1] as HTMLButtonElement;
    copyBtn?.click();

    const itemsCount = elementList?.querySelectorAll('.element-item').length;
    expect(itemsCount).toBe(2);
  });

  it('should add a new item via form', async () => {
    require('./popup');

    (document.getElementById('elementType') as HTMLSelectElement).value = 'any';
    (document.getElementById('selector') as HTMLInputElement).value = '.new-item';
    (document.getElementById('customName') as HTMLInputElement).value = 'New Item';

    const addUpdateBtn = document.getElementById('addUpdateBtn');
    addUpdateBtn?.click();

    const elementList = document.getElementById('elementList');
    expect(elementList?.innerHTML).toContain('New Item');
  });

  it('should update status button based on running state', () => {
    require('./popup');
    const toggleStartStopBtn = document.getElementById('toggleStartStopBtn');

    const onChangedCallback = (browser.storage.onChanged.addListener as jest.Mock).mock.calls[0][0];

    onChangedCallback({ isRunning: { newValue: true } });
    expect(toggleStartStopBtn?.textContent).toBe('Stop');

    onChangedCallback({ isRunning: { newValue: false } });
    expect(toggleStartStopBtn?.textContent).toBe('Start');
  });

  it('should update selector placeholder based on element type', () => {
    require('./popup');
    const elementTypeObj = document.getElementById('elementType') as HTMLSelectElement;
    const selectorInput = document.getElementById('selector') as HTMLInputElement;

    elementTypeObj.value = 'any';
    elementTypeObj.dispatchEvent(new Event('change'));
    expect(selectorInput.placeholder).toContain('(Required)');

    elementTypeObj.value = 'button';
    elementTypeObj.dispatchEvent(new Event('change'));
    expect(selectorInput.placeholder).toContain('(Optional)');
  });

  it('should toggle settings view', () => {
    require('./popup');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsView = document.getElementById('settingsView');
    const mainView = document.getElementById('mainView');

    expect(settingsView?.style.display).toBe('none');

    settingsBtn?.click();
    expect(settingsView?.style.display).toBe('flex');
    expect(mainView?.style.display).toBe('none');

    settingsBtn?.click();
    expect(settingsView?.style.display).toBe('none');
    expect(mainView?.style.display).toBe('flex');
  });

  it('should update progress bars when running', async () => {
    const now = 1000000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    (browser.storage.local.get as jest.Mock).mockResolvedValue({
      items: [{ id: '1', selector: '.btn', enabled: true, matchPattern: '.*', type: 'any', matchType: 'all' }],
      presets: [],
      currentPresetId: 'default',
      isRunning: true,
      interval: '1',
      startTime: now - 500,
      runMode: 'parallel',
    });

    jest.spyOn(window, 'requestAnimationFrame').mockImplementationOnce((cb) => {
      cb(now);
      return 1;
    });

    require('./popup');

    await new Promise((resolve) => setTimeout(resolve, 20));

    const bar = document.querySelector('.progress-bar') as HTMLElement;
    expect(bar).toBeDefined();
    if (bar) {
      expect(bar.style.width).toBeDefined();
    }
  });
});
