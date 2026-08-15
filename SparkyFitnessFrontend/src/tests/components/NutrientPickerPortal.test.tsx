import { fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { renderWithClient } from '../test-utils';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { NutrientPicker } from '@/pages/Medications/NutrientPicker';

// The picker's helpers now live in medicationUtils, which imports the real i18n
// singleton at module scope; that initialises HttpApi under jsdom and fails.
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: {
    t: (key: string, defaultValue?: string) => defaultValue || key,
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: unknown) => {
      if (typeof options === 'string') return options;
      if (options && typeof options === 'object') {
        const opts = options as {
          defaultValue?: string;
          defaultValue_other?: string;
          count?: number;
        };
        const template =
          opts.count !== undefined &&
          opts.count !== 1 &&
          opts.defaultValue_other
            ? opts.defaultValue_other
            : opts.defaultValue;
        if (typeof template !== 'string') return key;
        return template.replace('{{count}}', String(opts.count ?? ''));
      }
      return key;
    },
  }),
}));

const ensureCatalogSpy = jest.fn();
const createCustomSpy = jest.fn();

jest.mock('@/hooks/Foods/useCustomNutrients', () => ({
  useEnsureCatalogNutrientsMutation: () => ({
    mutateAsync: ensureCatalogSpy,
    isPending: false,
  }),
  useCreateCustomNutrientMutation: () => ({
    mutateAsync: createCustomSpy,
    isPending: false,
  }),
}));

beforeEach(() => {
  ensureCatalogSpy.mockReset();
  createCustomSpy.mockReset();
});

/**
 * The picker is opened from inside the medication Dialog. Radix Dialog locks scrolling with
 * react-remove-scroll and exempts ONLY its own content node (`shards: [contentRef]`), so a
 * popover portalled to document.body (Radix's default) cannot be wheel-scrolled and is
 * dismissed as part of the wrong layer — it stays open until the whole dialog is closed.
 * Portalling into the dialog's content node is what fixes both. Pin it.
 */
describe('NutrientPicker inside a Dialog', () => {
  it('portals its content into the surrounding dialog, not document.body', async () => {
    renderWithClient(
      <Dialog open>
        <DialogContent data-testid="med-dialog">
          <NutrientPicker
            selected={[]}
            customNutrients={[]}
            onAdd={jest.fn()}
          />
        </DialogContent>
      </Dialog>
    );

    fireEvent.click(screen.getByRole('button', { name: /add nutrient/i }));

    const search = await screen.findByPlaceholderText(/search nutrients/i);
    expect(screen.getByTestId('med-dialog')).toContainElement(search);
  });

  it('closes on Escape without closing the dialog underneath', async () => {
    const onOpenChange = jest.fn();

    renderWithClient(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent data-testid="med-dialog">
          <NutrientPicker
            selected={[]}
            customNutrients={[]}
            onAdd={jest.fn()}
          />
        </DialogContent>
      </Dialog>
    );

    fireEvent.click(screen.getByRole('button', { name: /add nutrient/i }));
    expect(
      await screen.findByPlaceholderText(/search nutrients/i)
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText(/search nutrients/i)
      ).not.toBeInTheDocument()
    );
    // Escape must be consumed by the popover layer, leaving the medication dialog open.
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('med-dialog')).toBeInTheDocument();
  });
});

/**
 * Picking used to create the `user_custom_nutrients` rows (plus their display-preference
 * and goal entries) immediately, so mis-clicking "Multivitamin panel" and then cancelling
 * the dialog left ~20 nutrients behind permanently — which is how 19 of them ended up on
 * every food search row. Creation now happens only when the supplement is SAVED.
 */
describe('NutrientPicker defers creation', () => {
  it('creates nothing server-side when a nutrient is picked; reports it as pending', async () => {
    const onAdd = jest.fn();
    renderWithClient(
      <NutrientPicker selected={[]} customNutrients={[]} onAdd={onAdd} />
    );

    fireEvent.click(screen.getByRole('button', { name: /add nutrient/i }));

    // Click-to-add: each row is a button; clicking it adds the nutrient immediately.
    fireEvent.click(await screen.findByRole('button', { name: /vitamin d/i }));

    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(ensureCatalogSpy).not.toHaveBeenCalled();
    expect(createCustomSpy).not.toHaveBeenCalled();
    // Handed upward as a pending catalog pick for the dialog to resolve on save.
    expect(onAdd).toHaveBeenCalledWith([
      expect.objectContaining({ key: 'Vitamin D', catalogId: 'vitamin_d' }),
    ]);
  });

  it('expands a compound (Omega-3) into its EPA and DHA component rows', async () => {
    const onAdd = jest.fn();
    renderWithClient(
      <NutrientPicker selected={[]} customNutrients={[]} onAdd={onAdd} />
    );

    fireEvent.click(screen.getByRole('button', { name: /add nutrient/i }));
    fireEvent.click(await screen.findByRole('button', { name: /omega-3/i }));

    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    // Picking the compound adds two individual rows for the user to fill in separately,
    // named so they still read as Omega-3 components.
    expect(onAdd).toHaveBeenCalledWith([
      expect.objectContaining({ key: 'Omega-3 EPA', catalogId: 'epa' }),
      expect.objectContaining({ key: 'Omega-3 DHA', catalogId: 'dha' }),
    ]);
  });

  it('creates nothing when the multivitamin panel is clicked', async () => {
    const onAdd = jest.fn();
    renderWithClient(
      <NutrientPicker selected={[]} customNutrients={[]} onAdd={onAdd} />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /multivitamin panel/i })
    );

    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(ensureCatalogSpy).not.toHaveBeenCalled();
    expect(createCustomSpy).not.toHaveBeenCalled();
    // The whole panel arrives as pending picks — nothing has been written.
    expect(onAdd.mock.calls[0][0].length).toBeGreaterThan(10);
  });
});

describe('NutrientPicker search', () => {
  it('surfaces a catalog entry when searching one of its aliases', async () => {
    renderWithClient(
      <NutrientPicker selected={[]} customNutrients={[]} onAdd={jest.fn()} />
    );

    fireEvent.click(screen.getByRole('button', { name: /add nutrient/i }));
    fireEvent.change(await screen.findByPlaceholderText(/search nutrients/i), {
      target: { value: 'Cholecalciferol' },
    });

    // "Cholecalciferol" is an alias of Vitamin D — the canonical row must still appear.
    expect(
      await screen.findByRole('button', { name: /vitamin d/i })
    ).toBeInTheDocument();
  });
});

/**
 * Energy and macros deliberately do NOT appear here. They are a closed set that co-occurs
 * on a label, so they live behind an "Include macros" checkbox as one block. Putting them
 * in this searchable list pushed the vitamins, which are the common case, below the fold.
 */
describe('NutrientPicker excludes energy and macros', () => {
  const openPicker = (selected: string[] = []) => {
    const onAdd = jest.fn();
    renderWithClient(
      <Dialog open>
        <DialogContent>
          <NutrientPicker
            selected={selected}
            customNutrients={[]}
            onAdd={onAdd}
          />
        </DialogContent>
      </Dialog>
    );
    fireEvent.click(screen.getByRole('button', { name: /add nutrient/i }));
    return onAdd;
  };

  it('offers no energy group', async () => {
    openPicker();

    await screen.findByPlaceholderText(/search nutrients/i);
    expect(screen.queryByText(/energy & macros/i)).not.toBeInTheDocument();
  });

  it.each(['Calories', 'Protein', 'Carbohydrates', 'Dietary fiber'])(
    'does not list %s',
    async (label) => {
      openPicker();

      await screen.findByPlaceholderText(/search nutrients/i);
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  );

  it('still offers vitamins and minerals', async () => {
    openPicker();

    expect(await screen.findByText(/vitamins & minerals/i)).toBeInTheDocument();
  });
});
