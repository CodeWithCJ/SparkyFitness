import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { simulatePageTranslation } from './simulatePageTranslation';

// A bare text node next to an element that comes and goes — the shape that
// breaks under browser page translation.
function Toggle({ shown }: { shown: boolean }) {
  return (
    <span data-testid="host">
      {shown && 'optional'}
      <i>icon</i>
    </span>
  );
}

const mountTranslated = () => {
  const view = render(<Toggle shown />);
  simulatePageTranslation(view.container);
  return view;
};

describe('translation DOM guard', () => {
  describe('without the guard', () => {
    it('crashes when React removes a text node the translator replaced', () => {
      const { rerender } = mountTranslated();
      expect(() => rerender(<Toggle shown={false} />)).toThrow();
    });
  });

  describe('with the guard installed', () => {
    beforeAll(async () => {
      const { installTranslationDomGuard } =
        await import('@/utils/translationDomGuard');
      installTranslationDomGuard();
      installTranslationDomGuard(); // idempotent
    });

    it('survives removing a replaced text node', () => {
      const { rerender } = mountTranslated();
      expect(() => rerender(<Toggle shown={false} />)).not.toThrow();
      expect(screen.getByTestId('host')).toBeInTheDocument();
    });

    it('keeps inserted content visible when the anchor was replaced', () => {
      mountTranslated();
      // Insert before a node that is no longer in the parent, as React does
      // when its anchor was swapped out by the translator.
      const host = screen.getByTestId('host');
      const detached = document.createTextNode('gone');
      const added = document.createElement('b');
      expect(() => host.insertBefore(added, detached)).not.toThrow();
      expect(host).toContainElement(added);
    });

    it('still removes and inserts normally otherwise', () => {
      const parent = document.createElement('div');
      const a = parent.appendChild(document.createElement('a'));
      const b = document.createElement('b');
      parent.insertBefore(b, a);
      expect(parent.firstChild).toBe(b);
      parent.removeChild(a);
      expect(parent.childNodes).toHaveLength(1);
    });
  });
});
