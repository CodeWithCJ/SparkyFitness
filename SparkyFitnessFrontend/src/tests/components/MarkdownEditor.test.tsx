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
    render(<MarkdownEditor value="**bold**" onChange={jest.fn()} />);

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
