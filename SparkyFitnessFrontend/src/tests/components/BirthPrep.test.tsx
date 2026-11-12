import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { HOSPITAL_BAG_ITEMS } from '@workspace/shared';
import BirthPrep from '@/pages/Cycle/care/BirthPrep';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

let mockActiveUserId: string | null = 'user-1';
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ activeUserId: mockActiveUserId }),
}));

const firstItem = HOSPITAL_BAG_ITEMS[0]!;
const packed = (count: number) =>
  screen.getByText(`${count} / ${HOSPITAL_BAG_ITEMS.length}`);

describe('BirthPrep', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockActiveUserId = 'user-1';
  });

  it('keeps the lists per person on a shared browser', () => {
    const { rerender } = render(<BirthPrep />);
    fireEvent.click(screen.getByText(firstItem.title));
    expect(packed(1)).toBeInTheDocument();
    expect(
      JSON.parse(window.localStorage.getItem('cycle.hospitalBag:user-1')!)
    ).toEqual({ [firstItem.key]: true });

    // Someone else takes over the page.
    mockActiveUserId = 'user-2';
    rerender(<BirthPrep />);
    expect(packed(0)).toBeInTheDocument();

    mockActiveUserId = 'user-1';
    rerender(<BirthPrep />);
    expect(packed(1)).toBeInTheDocument();
  });

  it('gives lists saved before they were per person to the first person who opens them', () => {
    window.localStorage.setItem(
      'cycle.hospitalBag',
      JSON.stringify({ [firstItem.key]: true })
    );

    const { unmount } = render(<BirthPrep />);
    expect(packed(1)).toBeInTheDocument();
    expect(window.localStorage.getItem('cycle.hospitalBag')).toBeNull();
    unmount();

    mockActiveUserId = 'user-2';
    render(<BirthPrep />);
    expect(packed(0)).toBeInTheDocument();
  });
});
