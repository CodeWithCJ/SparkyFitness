/**
 * Fast, lightweight, zero-dependency streaming XML parser tailored for C-CDA / HL7 documents.
 * Extracts elements, attributes, namespaces, and text safely without external dependencies.
 */

export interface XmlNode {
  tag: string;
  localName: string;
  namespace?: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  text: string;
}

export function parseXml(xmlString: string): XmlNode {
  // Strip XML declarations and comments
  const cleanXml = xmlString
    .replace(/<\?xml[^>]*\?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

  let pos = 0;
  const len = cleanXml.length;

  function skipWhitespace() {
    while (pos < len && /\s/.test(cleanXml[pos])) {
      pos++;
    }
  }

  function parseAttributes(attrStr: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const attrRegex = /([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let match: RegExpExecArray | null;
    while ((match = attrRegex.exec(attrStr)) !== null) {
      const name = match[1];
      const val = match[2] !== undefined ? match[2] : match[3];
      attrs[name] = unescapeXml(val);
    }
    return attrs;
  }

  function unescapeXml(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  function parseElement(): XmlNode | null {
    skipWhitespace();
    if (pos >= len || cleanXml[pos] !== '<') {
      return null;
    }

    // Check for end tag or DOCTYPE
    if (cleanXml.startsWith('<!', pos)) {
      const close = cleanXml.indexOf('>', pos);
      if (close !== -1) {
        pos = close + 1;
        skipWhitespace();
      }
    }

    if (pos >= len || cleanXml[pos] !== '<' || cleanXml[pos + 1] === '/') {
      return null;
    }

    pos++; // skip '<'
    const tagStart = pos;
    while (pos < len && !/[\s\/>]/.test(cleanXml[pos])) {
      pos++;
    }
    const fullTag = cleanXml.slice(tagStart, pos);
    const colonIdx = fullTag.indexOf(':');
    const localName = colonIdx !== -1 ? fullTag.slice(colonIdx + 1) : fullTag;
    const namespace = colonIdx !== -1 ? fullTag.slice(0, colonIdx) : undefined;

    // Attributes
    const attrStart = pos;
    let isSelfClosing = false;

    while (pos < len && cleanXml[pos] !== '>') {
      if (cleanXml[pos] === '/' && cleanXml[pos + 1] === '>') {
        isSelfClosing = true;
        pos++;
        break;
      }
      pos++;
    }
    const attrStr = cleanXml.slice(attrStart, isSelfClosing ? pos - 1 : pos);
    const attributes = parseAttributes(attrStr);

    pos++; // skip '>'

    const node: XmlNode = {
      tag: fullTag,
      localName,
      namespace,
      attributes,
      children: [],
      text: '',
    };

    if (isSelfClosing) {
      return node;
    }

    // Children & Text
    let textBuf = '';
    while (pos < len) {
      skipWhitespace();
      if (cleanXml.startsWith('</', pos)) {
        // Closing tag
        const closeEnd = cleanXml.indexOf('>', pos);
        if (closeEnd !== -1) {
          const closeTag = cleanXml.slice(pos + 2, closeEnd).trim();
          pos = closeEnd + 1;
          if (
            closeTag === fullTag ||
            closeTag.endsWith(':' + localName) ||
            closeTag === localName
          ) {
            break;
          }
        } else {
          break;
        }
      } else if (cleanXml[pos] === '<') {
        const child = parseElement();
        if (child) {
          node.children.push(child);
        } else {
          pos++;
        }
      } else {
        const nextTag = cleanXml.indexOf('<', pos);
        if (nextTag === -1) {
          textBuf += cleanXml.slice(pos);
          pos = len;
        } else {
          textBuf += cleanXml.slice(pos, nextTag);
          pos = nextTag;
        }
      }
    }

    node.text = unescapeXml(textBuf.trim());
    return node;
  }

  const root = parseElement();
  if (!root) {
    throw new Error('Failed to parse XML: No root element found');
  }
  return root;
}

/**
 * Traversal and query helpers for XmlNode trees.
 */
export function findChildrenByLocalName(
  node: XmlNode,
  localName: string
): XmlNode[] {
  return node.children.filter(
    (c) => c.localName.toLowerCase() === localName.toLowerCase()
  );
}

export function findFirstChildByLocalName(
  node: XmlNode,
  localName: string
): XmlNode | undefined {
  return node.children.find(
    (c) => c.localName.toLowerCase() === localName.toLowerCase()
  );
}

export function findDescendantsByLocalName(
  node: XmlNode,
  localName: string
): XmlNode[] {
  const result: XmlNode[] = [];
  function recurse(curr: XmlNode) {
    for (const child of curr.children) {
      if (child.localName.toLowerCase() === localName.toLowerCase()) {
        result.push(child);
      }
      recurse(child);
    }
  }
  recurse(node);
  return result;
}

export function getElementText(node: XmlNode): string {
  if (node.text) return node.text;
  let text = '';
  for (const child of node.children) {
    text += getElementText(child) + ' ';
  }
  return text.trim();
}
