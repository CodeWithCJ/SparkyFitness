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

const SafeImage: React.FC<SafeImageProps> = ({ source, style, fallback = null }) => {
  const [error, setError] = useState(false);
  const sourceSignature = getImageSourceSignature(source);

  useEffect(() => {
    setError(false);
  }, [sourceSignature]);

  if (!source || error) return fallback;

  return (
    <Image
      source={{ uri: source.uri, headers: source.headers }}
      style={style}
      onError={() => setError(true)}
    />
  );
};

export default SafeImage;
