import React from 'react';

type TranslationOptions = Record<string, unknown>;

export const translateForTest = (
  key: string,
  defaultValueOrOptions?: string | TranslationOptions,
  values?: TranslationOptions
): string => {
  const options =
    typeof defaultValueOrOptions === 'string' ? values : defaultValueOrOptions;
  const defaultValue =
    typeof defaultValueOrOptions === 'string'
      ? defaultValueOrOptions
      : options?.['defaultValue'];
  const count = options?.['count'];
  const singularDefault = options?.['defaultValue_one'];
  const pluralDefault = options?.['defaultValue_other'];
  const template =
    count === 1 && typeof singularDefault === 'string'
      ? singularDefault
      : count !== undefined && count !== 1 && typeof pluralDefault === 'string'
        ? pluralDefault
        : defaultValue;

  if (typeof template !== 'string') return key;
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
    String(options?.[name] ?? `{{${name}}}`)
  );
};

export const useTranslation = () => ({
  t: translateForTest,
  i18n: { language: 'en' },
});

const interpolate = (
  template: string,
  values?: Record<string, unknown>
): string =>
  template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    values && name in values ? String(values[name]) : match
  );

type Node = string | { tag: string; children: Node[]; selfClosing: boolean };

const parse = (input: string): Node[] => {
  const root: Node[] = [];
  const stack: { tag: string; children: Node[] }[] = [];
  const current = (): Node[] => stack[stack.length - 1]?.children ?? root;
  const tokens = /<(\/?)(\w+)(\/?)>/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(input))) {
    if (match.index > last) current().push(input.slice(last, match.index));
    last = tokens.lastIndex;
    const closing = match[1];
    const tag = match[2] ?? '';
    const selfClosing = match[3];
    if (selfClosing) current().push({ tag, children: [], selfClosing: true });
    else if (closing) {
      const done = stack.pop();
      if (done)
        current().push({
          tag: done.tag,
          children: done.children,
          selfClosing: false,
        });
    } else stack.push({ tag, children: [] });
  }
  if (last < input.length) current().push(input.slice(last));
  return root;
};

const render = (
  nodes: Node[],
  components: Record<string, React.ReactElement>
): React.ReactNode[] =>
  nodes.map((node, i) => {
    if (typeof node === 'string') return node;
    const element = components[node.tag];
    if (!element) return render(node.children, components);
    return node.selfClosing
      ? React.cloneElement(element, { key: i })
      : React.cloneElement(
          element,
          { key: i },
          ...render(node.children, components)
        );
  });

/** `<Trans>` stand-in: renders the English defaults with the given components. */
export const Trans = ({
  i18nKey,
  defaults,
  values,
  components = {},
}: {
  i18nKey?: string;
  defaults?: string;
  values?: Record<string, unknown>;
  components?: Record<string, React.ReactElement>;
}) =>
  React.createElement(
    React.Fragment,
    null,
    ...render(parse(interpolate(defaults ?? i18nKey ?? '', values)), components)
  );

export const initReactI18next = { type: '3rdParty', init: () => undefined };
