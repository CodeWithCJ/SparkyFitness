import { act, renderHook } from '@testing-library/react';
import {
  settingsSectionElementId,
  useOpenSettingsSections,
} from '@/hooks/Settings/useOpenSettingsSections';

describe('useOpenSettingsSections', () => {
  beforeEach(() => {
    jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0);
        return 0;
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('opens the section the address names', () => {
    const { result } = renderHook(() =>
      useOpenSettingsSections('features', 'first')
    );
    expect(result.current.openSections).toEqual(['features']);
  });

  it('opens the section again when a link names it again', () => {
    const { result, rerender } = renderHook(
      ({ key }) => useOpenSettingsSections('features', key),
      { initialProps: { key: 'first' } }
    );
    act(() => result.current.setOpenSections([]));
    rerender({ key: 'second' });
    expect(result.current.openSections).toEqual(['features']);
  });

  it('opens a section from inside the page and brings it into view', () => {
    const element = document.createElement('div');
    element.id = settingsSectionElementId('features');
    element.scrollIntoView = jest.fn();
    document.body.appendChild(element);
    const { result } = renderHook(() =>
      useOpenSettingsSections('web-tabs', 'first')
    );

    act(() => result.current.openSection('features'));

    expect(result.current.openSections).toEqual(['web-tabs', 'features']);
    expect(element.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
  });
});
