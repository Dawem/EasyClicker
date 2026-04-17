import { generateConciseTitle } from './utils';
import { ClickItem } from './types';

function createMockItem(overrides: Partial<ClickItem>): ClickItem {
  return {
    id: '1',
    type: 'any',
    matchType: 'first',
    selector: '',
    matchPattern: '.*',
    enabled: true,
    ...overrides,
  };
}

describe('generateConciseTitle', () => {
  it('should use targetText if provided', () => {
    const item = createMockItem({ selector: '.btn', targetText: 'Buy Now' });
    expect(generateConciseTitle(item, '.btn')).toBe('Click "Buy Now"');
  });

  it('should truncate long targetText', () => {
    const item = createMockItem({
      selector: '.btn',
      targetText: 'This is a very very long button text that should be truncated',
    });
    expect(generateConciseTitle(item, '.btn')).toBe('Click "This is a very very ..."');
  });

  it('should use ID from selector if targetText is missing', () => {
    const item = createMockItem({ selector: 'button#submit-btn' });
    expect(generateConciseTitle(item, 'button#submit-btn')).toBe('Click Button #submit-btn');
  });

  it('should use class from selector if ID and targetText are missing', () => {
    const item = createMockItem({ selector: 'div.product-card' });
    expect(generateConciseTitle(item, 'div.product-card')).toBe('Click Div .product-card');
  });

  it('should handle complex selectors by using the last node', () => {
    const item = createMockItem({ selector: 'body > main > div#app button.primary' });
    expect(generateConciseTitle(item, 'body > main > div#app button.primary')).toBe('Click Button .primary');
  });

  it('should strip nth-of-type and other pseudo selectors', () => {
    const item = createMockItem({ selector: 'li:nth-of-type(5)' });
    expect(generateConciseTitle(item, 'li:nth-of-type(5)')).toBe('Click Li');
  });

  it('should default to tag name if no ID or class in last node', () => {
    const item = createMockItem({ selector: 'section > article' });
    expect(generateConciseTitle(item, 'section > article')).toBe('Click Article');
  });
});
