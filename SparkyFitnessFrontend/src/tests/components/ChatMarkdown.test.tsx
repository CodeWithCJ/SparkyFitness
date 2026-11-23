import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type {
  ComponentType,
  ImgHTMLAttributes,
  AnchorHTMLAttributes,
} from 'react';
import { MarkdownText } from '@/components/markdown-text';

let mockImage = 'https://evil.example/?d=x';
jest.mock('@assistant-ui/react-markdown', () => ({
  unstable_memoizeMarkdownComponents: (components: unknown) => components,
  useIsMarkdownCodeBlock: () => false,
  MarkdownTextPrimitive: ({
    components,
  }: {
    components: {
      img: ComponentType<ImgHTMLAttributes<HTMLImageElement>>;
      a: ComponentType<AnchorHTMLAttributes<HTMLAnchorElement>>;
    };
  }) => {
    const Image = components.img;
    const Link = components.a;
    return (
      <>
        <Image src={mockImage} alt="assistant image" />
        <Link href="https://example.com">Normal link</Link>
      </>
    );
  },
}));
it.each([
  'https://evil.example/?d=x',
  '//evil.example/?d=x',
  'data:text/html,evil',
  'blob:https://evil.example/id',
])('never mounts a remote image or requests it: %s', (src) => {
  mockImage = src;
  const request = jest.fn();
  Object.defineProperty(global, 'fetch', {
    value: request,
    configurable: true,
    writable: true,
  });
  const { container } = render(<MarkdownText />);
  expect(container.querySelector('img')).toBeNull();
  expect(request).not.toHaveBeenCalled();
  expect(screen.getByRole('link', { name: 'Normal link' })).toHaveAttribute(
    'href',
    'https://example.com'
  );
  Reflect.deleteProperty(global, 'fetch');
});
it.each([
  '/uploads/photo.jpg',
  'data:image/png;base64,AAAA',
  `${window.location.origin}/uploads/photo.jpg`,
])('allows local images: %s', (src) => {
  mockImage = src;
  render(<MarkdownText />);
  expect(screen.getByRole('img')).toHaveAttribute('src', src);
});
