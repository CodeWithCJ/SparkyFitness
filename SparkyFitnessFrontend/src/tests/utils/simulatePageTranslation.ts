/**
 * Mimics what Chrome/Edge page translation does to the DOM: every non-empty
 * text node is replaced by a <font> element carrying the translated text.
 * React still holds references to the original text nodes, which are now
 * detached — exactly the state that makes later updates fail.
 */
export function simulatePageTranslation(root: Node): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.data.trim()) textNodes.push(node);
  }
  for (const node of textNodes) {
    const font = document.createElement('font');
    font.textContent = node.data;
    node.parentNode?.replaceChild(font, node);
  }
}
