import { generateConciseTitle, getApexDomain, matchPatternToRegExp } from '../src/utils';
import { ClickItem } from '../src/types';

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

describe('matchPatternToRegExp', () => {
  it('should match all URLs with <all_urls>', () => {
    const re = matchPatternToRegExp('<all_urls>');
    expect(re.test('https://example.com')).toBe(true);
    expect(re.test('http://sub.domain.org/path')).toBe(true);
    expect(re.test('file:///C:/test.txt')).toBe(true);
  });

  it('should match wildcard subdomains', () => {
    const re = matchPatternToRegExp('*://*.example.com/*');
    expect(re.test('https://example.com/')).toBe(true);
    expect(re.test('http://www.example.com/some/path')).toBe(true);
    expect(re.test('https://sub.sub.example.com/')).toBe(true);
    expect(re.test('https://example.org/')).toBe(false);
  });

  it('should match specific schemes and paths', () => {
    const re = matchPatternToRegExp('https://example.com/specific-page');
    expect(re.test('https://example.com/specific-page')).toBe(true);
    expect(re.test('http://example.com/specific-page')).toBe(false);
    expect(re.test('https://example.com/other')).toBe(false);
  });

  it('should handles wildcards in paths', () => {
    const re = matchPatternToRegExp('https://example.com/products/*');
    expect(re.test('https://example.com/products/123')).toBe(true);
    expect(re.test('https://example.com/products/category/item')).toBe(true);
    expect(re.test('https://example.com/about')).toBe(false);
  });

  it('should handle malformed patterns gracefully', () => {
    const re = matchPatternToRegExp('not-a-pattern');
    expect(re.test('https://anything.com')).toBe(false);
  });
});

describe('getApexDomain', () => {
  it('should return the hostname if it has only two parts', () => {
    expect(getApexDomain('example.com')).toBe('example.com');
  });

  it('should return the last two parts for standard domains', () => {
    expect(getApexDomain('www.example.com')).toBe('example.com');
    expect(getApexDomain('sub.www.example.com')).toBe('example.com');
  });

  it('should return the last three parts for short SLDs', () => {
    expect(getApexDomain('example.co.uk')).toBe('example.co.uk');
    expect(getApexDomain('www.example.co.uk')).toBe('example.co.uk');
    expect(getApexDomain('sub.example.com.br')).toBe('example.com.br');
  });

  it('should handle empty input', () => {
    expect(getApexDomain('')).toBe('');
  });
});
