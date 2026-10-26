export function getBasePath(): string {
  const href = document.querySelector('base')?.getAttribute('href') ?? '/';
  return href.replace(/\/+$/, '');
}

export function withBasePath(path: string): string {
  return `${getBasePath()}${path}`;
}

export function getRouterBasename(): string {
  return getBasePath() || '/';
}

/**
 * Route-relative equivalent of `url(#id)` for SVG fragment refs (gradients,
 * filters, clip-paths). With a document-wide <base> tag present, a plain
 * `url(#id)` resolves against the base URL, not the current route — this
 * restores correct fragment resolution regardless of the <base> tag.
 */
export function svgFragmentUrl(id: string): string {
  return `url(${window.location.pathname}${window.location.search}#${id})`;
}
