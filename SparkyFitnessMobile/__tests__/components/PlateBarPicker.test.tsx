import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { presetInventory, type PlateBar } from '@workspace/shared';
import PlateBarPicker, {
  pickerBars,
} from '../../src/components/PlateBarPicker';
import { initializeI18n } from '../../src/localization/i18n';

beforeAll(async () => {
  await initializeI18n('en');
});

const bars: PlateBar[] = presetInventory('kg').bars;

const renderPicker = (
  count: number,
  selectedId: string | null = bars[0]!.id,
  onSelect = jest.fn()
) => {
  render(
    <PlateBarPicker
      bars={bars.slice(0, count)}
      selectedId={selectedId}
      suggestedId={bars[0]!.id}
      unit="kg"
      onSelect={onSelect}
    />
  );
  return onSelect;
};

describe('PlateBarPicker', () => {
  it('shows a single bar as one segment with no More bars chip', () => {
    renderPicker(1);
    expect(screen.getByText('Barbell 20 kg')).toBeTruthy();
    expect(screen.queryByLabelText('More bars')).toBeNull();
  });

  it('shows two bars as two segments with no More bars chip', () => {
    const onSelect = renderPicker(2);
    expect(screen.getByText("Women's bar 15 kg")).toBeTruthy();
    expect(screen.queryByLabelText('More bars')).toBeNull();
    fireEvent.press(screen.getByText("Women's bar 15 kg"));
    expect(onSelect).toHaveBeenCalledWith(bars[1]!.id);
  });

  it('shows the suggested and one more bar of four, the rest behind More bars', () => {
    const onSelect = renderPicker(4);
    expect(screen.getByText('Barbell 20 kg')).toBeTruthy();
    expect(screen.getByText("Women's bar 15 kg")).toBeTruthy();
    expect(screen.queryByText('Trap bar 25 kg')).toBeNull();
    fireEvent.press(screen.getByLabelText('More bars'));
    expect(screen.getByText('EZ bar 7.5 kg')).toBeTruthy();
    fireEvent.press(screen.getByText('Trap bar 25 kg'));
    expect(onSelect).toHaveBeenCalledWith(bars[3]!.id);
    expect(screen.queryByText('EZ bar 7.5 kg')).toBeNull();
  });

  it('never truncates a label', () => {
    renderPicker(4);
    expect(
      screen.getByText('Barbell 20 kg').props.numberOfLines
    ).toBeUndefined();
  });
});

describe('pickerBars', () => {
  it('swaps the second segment for a bar picked from More bars', () => {
    const { segments } = pickerBars(bars, bars[3]!.id, bars[0]!.id);
    expect(segments.map((b) => b.id)).toEqual([bars[0]!.id, bars[3]!.id]);
  });

  it('defaults the other segment to the next bar', () => {
    const { segments, hasMore } = pickerBars(bars, bars[0]!.id, bars[0]!.id);
    expect(segments.map((b) => b.id)).toEqual([bars[0]!.id, bars[1]!.id]);
    expect(hasMore).toBe(true);
  });
});
