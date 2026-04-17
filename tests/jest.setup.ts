import 'jest-webextension-mock';

jest.mock('webextension-polyfill', () => chrome);
