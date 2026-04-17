import { ClickItem } from './types';

export function generateConciseTitle(item: ClickItem, fullSel: string): string {
  if (item.targetText) {
    return `Click "${item.targetText.substring(0, 20)}${item.targetText.length > 20 ? '...' : ''}"`;
  }
  let lastNode = fullSel;
  // Handle both > and space separators to get the actual target element
  const parts = lastNode.split(/[> ]+/);
  if (parts.length > 0) {
    lastNode = parts[parts.length - 1].trim();
  }
  lastNode = lastNode.replace(/:nth-[a-z-]+\([0-9]+\)/g, '');

  let tagExtracted = 'Element';
  const tagMatch = lastNode.match(/^[a-zA-Z0-9_-]+/);
  if (tagMatch) {
    tagExtracted = tagMatch[0];
    lastNode = lastNode.substring(tagExtracted.length);
    tagExtracted = tagExtracted.charAt(0).toUpperCase() + tagExtracted.slice(1);
  }

  let conciseTitle = '';
  if (lastNode.includes('#')) {
    const idMatch = lastNode.match(/#[a-zA-Z0-9_-]+/);
    if (idMatch) conciseTitle = `${tagExtracted} ${idMatch[0]}`;
  } else if (lastNode.includes('.')) {
    const classMatch = lastNode.match(/\.[a-zA-Z0-9_-]+/);
    if (classMatch) conciseTitle = `${tagExtracted} ${classMatch[0]}`;
  }

  return 'Click ' + (conciseTitle || tagExtracted);
}
