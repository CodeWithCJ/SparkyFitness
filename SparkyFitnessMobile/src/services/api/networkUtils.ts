export const checkIsLocalNetwork = (url: string): boolean => {
  if (!url) return false;
  const hostname = url.match(/^https?:\/\/([^:/]+)/i)?.[1] || '';
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
};
