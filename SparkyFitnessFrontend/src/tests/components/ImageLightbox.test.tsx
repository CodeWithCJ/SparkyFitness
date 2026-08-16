import '@testing-library/jest-dom';
import { render, screen, act, fireEvent } from '@testing-library/react';
import ImageLightbox from '@/components/FoodSearch/ImageLightbox';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: unknown) =>
      typeof fallback === 'string'
        ? fallback
        : ((fallback as { defaultValue?: string })?.defaultValue ?? _key),
  }),
}));

const IMAGES = ['/uploads/foods/a/1.png', '/uploads/foods/a/2.png'];

describe('ImageLightbox', () => {
  it('renders nothing when there are no images', () => {
    const { container } = render(
      <ImageLightbox images={[]} open={true} onOpenChange={jest.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('opens on the clicked image rather than the first', () => {
    render(
      <ImageLightbox
        images={IMAGES}
        open={true}
        initialIndex={1}
        onOpenChange={jest.fn()}
      />
    );
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('advances and wraps with the next control', () => {
    render(
      <ImageLightbox images={IMAGES} open={true} onOpenChange={jest.fn()} />
    );

    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Next image'));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    // Wraps back around rather than stopping at the end.
    fireEvent.click(screen.getByLabelText('Next image'));
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('auto-advances on a timer while playing', () => {
    jest.useFakeTimers();
    try {
      render(
        <ImageLightbox images={IMAGES} open={true} onOpenChange={jest.fn()} />
      );
      expect(screen.getByText('1 / 2')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(3000);
      });
      expect(screen.getByText('2 / 2')).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('stops auto-advancing once the user navigates manually', () => {
    jest.useFakeTimers();
    try {
      render(
        <ImageLightbox images={IMAGES} open={true} onOpenChange={jest.fn()} />
      );

      fireEvent.click(screen.getByLabelText('Next image'));
      expect(screen.getByText('2 / 2')).toBeInTheDocument();

      // Timer would have fired twice by now; the slide must not have moved.
      act(() => {
        jest.advanceTimersByTime(9000);
      });
      expect(screen.getByText('2 / 2')).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('hides slideshow controls for a single image', () => {
    render(
      <ImageLightbox
        images={['/uploads/foods/a/1.png']}
        open={true}
        onOpenChange={jest.fn()}
      />
    );
    expect(screen.queryByLabelText('Next image')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Pause slideshow')).not.toBeInTheDocument();
  });
});
