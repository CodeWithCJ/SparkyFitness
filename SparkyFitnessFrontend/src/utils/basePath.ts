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
