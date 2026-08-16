import { renderHook, act } from '@testing-library/react-native';
import { useImageLightbox } from '../../src/hooks/useImageLightbox';

describe('useImageLightbox', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useImageLightbox());
    expect(result.current.lightboxProps.visible).toBe(false);
  });

  it('opens at the tapped index', () => {
    const { result } = renderHook(() => useImageLightbox());

    act(() => {
      result.current.openLightbox(['/a.jpg', '/b.jpg', '/c.jpg'], 2, 'Nutella');
    });

    expect(result.current.lightboxProps).toMatchObject({
      visible: true,
      initialIndex: 2,
      title: 'Nutella',
    });
  });

  it('clamps an out-of-range index to the available images', () => {
    const { result } = renderHook(() => useImageLightbox());

    act(() => {
      result.current.openLightbox(['/a.jpg'], 7);
    });

    expect(result.current.lightboxProps.initialIndex).toBe(0);
  });

  it('ignores an open request with no images', () => {
    // Nothing to show — opening an empty modal would trap the user behind a
    // black screen with only a close button.
    const { result } = renderHook(() => useImageLightbox());

    act(() => {
      result.current.openLightbox([], 0);
    });

    expect(result.current.lightboxProps.visible).toBe(false);
  });

  it('closes without dropping the images mid-animation', () => {
    const { result } = renderHook(() => useImageLightbox());

    act(() => {
      result.current.openLightbox(['/a.jpg', '/b.jpg'], 1);
    });
    act(() => {
      result.current.lightboxProps.onClose();
    });

    expect(result.current.lightboxProps.visible).toBe(false);
    // Kept so the fade-out renders the image instead of an empty frame.
    expect(result.current.lightboxProps.images).toEqual(['/a.jpg', '/b.jpg']);
  });
});

describe('reopening', () => {
  it('reports a fresh open even at the same index', () => {
    // ImageLightbox re-seeds (index + autoplay) off the visible transition.
    // Every caller opens at index 0, so a reopen must still register as a
    // change — otherwise autoplay stays off for the rest of the session.
    const { result } = renderHook(() => useImageLightbox());

    act(() => result.current.openLightbox(['/a.jpg', '/b.jpg'], 0));
    act(() => result.current.lightboxProps.onClose());
    expect(result.current.lightboxProps.visible).toBe(false);

    act(() => result.current.openLightbox(['/a.jpg', '/b.jpg'], 0));
    expect(result.current.lightboxProps.visible).toBe(true);
    expect(result.current.lightboxProps.initialIndex).toBe(0);
  });
});
