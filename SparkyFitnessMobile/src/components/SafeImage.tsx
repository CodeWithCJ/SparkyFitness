import React, { useEffect, useState } from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';
interface SafeImageProps {
  source: { uri: string; headers: Record<string, string> } | null;
  style: StyleProp<ImageStyle>;
  fallback?: React.ReactNode;
}

function getImageSourceSignature(
  source: { uri: string; headers: Record<string, string> } | null,
): string {
  if (!source) return '';

  const headerSignature = Object.entries(source.headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join('|');

  return `${source.uri}|${headerSignature}`;
}

// Exercise images are downloaded on-demand by the server on first request, so
// the initial fetch can race ahead of the server having the file on disk.
// Retry a couple of times with backoff before giving up to the fallback.
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

const SafeImage: React.FC<SafeImageProps> = ({ source, style, fallback = null }) => {
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const sourceSignature = getImageSourceSignature(source);

  useEffect(() => {
    setError(false);
    setAttempt(0);
  }, [sourceSignature]);

  useEffect(() => {
    if (!error || attempt >= MAX_RETRIES) return;
    const timer = setTimeout(() => {
      setError(false);
      setAttempt((a) => a + 1);
    }, RETRY_DELAY_MS * (attempt + 1));
    return () => clearTimeout(timer);
  }, [error, attempt]);

  if (!source || (error && attempt >= MAX_RETRIES)) return fallback;

  return (
    <Image
      key={attempt}
      source={{ uri: source.uri, headers: source.headers }}
      style={style}
      onError={() => setError(true)}
    />
  );
};

export default SafeImage;
