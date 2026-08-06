import { visibleDoseCards } from '@/pages/Medications/medicationUtils';

// The Log view renders one card per subtype. The medications card doubles as the
// "nothing scheduled at all" empty state, which is why it is not simply
// `hasMedicationContent` — dropping it in the All view would leave a user whose only
// entries are supplements-in-waiting looking at a blank column.
describe('visibleDoseCards', () => {
  it('shows both cards in the All view once a supplement has content', () => {
    expect(visibleDoseCards('all', true)).toEqual({
      medications: true,
      supplements: true,
    });
  });

  it('keeps the medications card alone in All when no supplement has content', () => {
    expect(visibleDoseCards('all', false)).toEqual({
      medications: true,
      supplements: false,
    });
  });

  it('shows only the medications card in the Meds view', () => {
    expect(visibleDoseCards('meds', true)).toEqual({
      medications: true,
      supplements: false,
    });
    expect(visibleDoseCards('meds', false)).toEqual({
      medications: true,
      supplements: false,
    });
  });

  it('shows only the supplements card in the Supplements view, even when empty', () => {
    // Empty here must still render the supplement card rather than falling back to
    // the medications one, or the Supplements filter would show a card headed
    // "Today's medications".
    expect(visibleDoseCards('supplements', false)).toEqual({
      medications: false,
      supplements: true,
    });
    expect(visibleDoseCards('supplements', true)).toEqual({
      medications: false,
      supplements: true,
    });
  });
});
