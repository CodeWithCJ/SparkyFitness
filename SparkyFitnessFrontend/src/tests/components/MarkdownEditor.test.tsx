import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  MarkdownEditor,
  applyToolbarAction,
} from '@/components/ui/MarkdownEditor';

/**
 * `applyToolbarAction` is the part worth testing hard: it is pure selection
 * arithmetic, and getting it wrong corrupts the user's text rather than merely
 * looking wrong.
 */
describe('applyToolbarAction', () => {
  const bold = {
    kind: 'wrap' as const,
    before: '**',
    after: '**',
    placeholder: 'bold',
  };

  it('wraps the selection and selects the body, not the markers', () => {
    const result = applyToolbarAction(bold, 'a rice bowl', 2, 6);

    expect(result.text).toBe('a **rice** bowl');
    expect(result.text.slice(result.selectionStart, result.selectionEnd)).toBe(
      'rice'
    );
  });

  it('inserts a selected placeholder when nothing is selected', () => {
    const result = applyToolbarAction(bold, '', 0, 0);

    expect(result.text).toBe('**bold**');
    // Selected, so the next keystroke replaces the placeholder.
    expect(result.text.slice(result.selectionStart, result.selectionEnd)).toBe(
      'bold'
    );
  });

  it('prefixes whole lines even when the caret is mid-line', () => {
    const bullets = { kind: 'linePrefix' as const, prefix: '- ' };
    // Caret sits inside "rice", not at a line boundary.
    const result = applyToolbarAction(bullets, 'rice\nchicken', 2, 2);

    expect(result.text).toBe('- rice\nchicken');
  });

  it('numbers each line of a multi-line selection', () => {
    const numbered = {
      kind: 'linePrefix' as const,
      prefix: (index: number) => `${index + 1}. `,
    };
    const result = applyToolbarAction(numbered, 'rice\nchicken\nsalsa', 0, 18);

    expect(result.text).toBe('1. rice\n2. chicken\n3. salsa');
  });
});

describe('MarkdownEditor', () => {
  it('reports edits to the parent', () => {
    const onChange = jest.fn();
    render(<MarkdownEditor value="" onChange={onChange} id="notes" />);

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'double chicken' },
    });

    expect(onChange).toHaveBeenCalledWith('double chicken');
  });

  it('swaps the textarea for a rendered preview', () => {
    // A non-empty note opens rendered, so start from Write explicitly.
    render(<MarkdownEditor value="**bold**" onChange={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Write' }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('markdown')).toHaveTextContent('**bold**');
  });

  it('tells the user when there is nothing to preview', () => {
    render(<MarkdownEditor value="   " onChange={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(screen.getByText('Nothing to preview yet.')).toBeInTheDocument();
  });

  it('caps input at maxLength', () => {
    render(<MarkdownEditor value="" onChange={jest.fn()} maxLength={10} />);

    expect(screen.getByRole('textbox')).toHaveAttribute('maxlength', '10');
  });
});

describe('applyToolbarAction — block inserts', () => {
  const table = {
    kind: 'block' as const,
    snippet: '| Item | Amount |\n| --- | --- |\n',
    select: 'Item',
  };

  it('opens a new line when the caret is mid-text', () => {
    const result = applyToolbarAction(table, 'chipotle bowl', 13, 13);

    // A table glued onto the end of a sentence is not a table.
    expect(result.text).toBe(
      'chipotle bowl\n| Item | Amount |\n| --- | --- |\n'
    );
    expect(result.text.slice(result.selectionStart, result.selectionEnd)).toBe(
      'Item'
    );
  });

  it('does not add a blank line when already at the start of one', () => {
    const result = applyToolbarAction(table, 'notes\n', 6, 6);

    expect(result.text).toBe('notes\n| Item | Amount |\n| --- | --- |\n');
  });

  it('selects the placeholder so it can be typed over', () => {
    const result = applyToolbarAction(table, '', 0, 0);

    expect(result.text.slice(result.selectionStart, result.selectionEnd)).toBe(
      'Item'
    );
  });
});

describe('applyToolbarAction — new line prefixes', () => {
  it('prefixes a heading', () => {
    const result = applyToolbarAction(
      { kind: 'linePrefix', prefix: '## ' },
      'Ingredients',
      0,
      0
    );

    expect(result.text).toBe('## Ingredients');
  });

  it('prefixes every selected line for a checklist', () => {
    const result = applyToolbarAction(
      { kind: 'linePrefix', prefix: '- [ ] ' },
      'rice\nchicken',
      0,
      12
    );

    expect(result.text).toBe('- [ ] rice\n- [ ] chicken');
  });
});

describe('MarkdownEditor preview default', () => {
  it('opens in Preview when the note already has text', () => {
    render(<MarkdownEditor value="**already written**" onChange={() => {}} />);

    expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('opens in Write when the note is empty', () => {
    render(<MarkdownEditor value="" onChange={() => {}} />);

    expect(screen.getByRole('button', { name: 'Write' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('switches to Preview when the value arrives after mount', () => {
    // The entry is often still loading when the editor first renders.
    const { rerender } = render(
      <MarkdownEditor value="" onChange={() => {}} />
    );
    rerender(<MarkdownEditor value="loaded later" onChange={() => {}} />);

    expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('stays in Write when the user types into an empty note', () => {
    // Typing the first character used to look identical to a value arriving
    // from a query, which threw the user into Preview mid-word.
    const Harness = () => {
      const [value, setValue] = useState('');
      return <MarkdownEditor value={value} onChange={setValue} />;
    };
    render(<Harness />);

    expect(screen.getByRole('button', { name: 'Write' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a' } });

    expect(screen.getByRole('button', { name: 'Write' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('textbox')).toHaveValue('a');
  });

  it('stays in Write after a toolbar insert into an empty note', () => {
    const Harness = () => {
      const [value, setValue] = useState('');
      return <MarkdownEditor value={value} onChange={setValue} />;
    };
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));

    expect(screen.getByRole('button', { name: 'Write' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('never overrides an explicit choice to keep writing', () => {
    const { rerender } = render(
      <MarkdownEditor value="" onChange={() => {}} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Write' }));
    rerender(<MarkdownEditor value="typed" onChange={() => {}} />);

    // Being yanked into Preview mid-keystroke would be worse than never
    // auto-switching at all.
    expect(screen.getByRole('button', { name: 'Write' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});

describe('MarkdownEditor expand toggle', () => {
  it('grows the textarea and can be shrunk again', () => {
    // A recipe outgrows the default five rows quickly.
    render(<MarkdownEditor value="" onChange={() => {}} rows={5} />);

    expect(screen.getByRole('textbox')).toHaveAttribute('rows', '5');

    fireEvent.click(screen.getByRole('button', { name: 'Expand editor' }));
    expect(screen.getByRole('textbox')).toHaveAttribute('rows', '20');

    fireEvent.click(screen.getByRole('button', { name: 'Shrink editor' }));
    expect(screen.getByRole('textbox')).toHaveAttribute('rows', '5');
  });

  it('stays available in Preview so the size does not jump', () => {
    render(<MarkdownEditor value="written" onChange={() => {}} />);

    // Opens in Preview because the note has text.
    expect(
      screen.getByRole('button', { name: 'Expand editor' })
    ).toBeInTheDocument();
  });
});
