import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DateTimeInput, TimeInput } from '@/components/ui/TimeInput';

let mockTimeFormat = 'HH:mm';

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ timeFormat: mockTimeFormat }),
}));

// Segments receive typed characters through native `beforeinput` events.
const typeIntoFocusedSegment = (text: string) => {
  for (const data of text) {
    act(() => {
      document.activeElement?.dispatchEvent(
        new InputEvent('beforeinput', {
          inputType: 'insertText',
          data,
          bubbles: true,
          cancelable: true,
        })
      );
    });
  }
};

const segmentTexts = () =>
  screen.getAllByRole('spinbutton').map((segment) => segment.textContent);

function ControlledTimeInput({
  initial,
  onChange,
}: {
  initial: string;
  onChange: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <TimeInput
      aria-label="Meal time"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('TimeInput', () => {
  beforeEach(() => {
    mockTimeFormat = 'HH:mm';
  });

  it('renders 24-hour time without an AM/PM segment when the preference is HH:mm', () => {
    render(
      <TimeInput aria-label="Meal time" value="14:30" onChange={jest.fn()} />
    );

    expect(segmentTexts()).toEqual(['14', '30']);
  });

  it('pads single-digit hours in 24-hour mode', () => {
    render(
      <TimeInput aria-label="Meal time" value="09:05" onChange={jest.fn()} />
    );

    expect(segmentTexts()).toEqual(['09', '05']);
  });

  it('renders 12-hour time with AM/PM when the preference is h:mm A', () => {
    mockTimeFormat = 'h:mm A';
    render(
      <TimeInput aria-label="Meal time" value="14:30" onChange={jest.fn()} />
    );

    expect(segmentTexts()).toEqual(['2', '30', 'PM']);
  });

  it('emits HH:mm when the user types a time in 24-hour mode', () => {
    const onChange = jest.fn();
    render(<ControlledTimeInput initial="" onChange={onChange} />);

    act(() => screen.getAllByRole('spinbutton')[0]!.focus());
    typeIntoFocusedSegment('1845');

    expect(onChange).toHaveBeenLastCalledWith('18:45');
    expect(segmentTexts()).toEqual(['18', '45']);
  });

  it('emits HH:mm in 24-hour form even when the field shows 12-hour time', () => {
    mockTimeFormat = 'h:mm a';
    const onChange = jest.fn();
    render(<ControlledTimeInput initial="14:30" onChange={onChange} />);

    const minute = screen.getAllByRole('spinbutton')[1]!;
    fireEvent.keyDown(minute, { key: 'ArrowUp' });

    expect(onChange).toHaveBeenLastCalledWith('14:31');
  });

  it('emits an empty string when every segment is cleared', () => {
    const onChange = jest.fn();
    render(<ControlledTimeInput initial="14:30" onChange={onChange} />);

    const [hour, minute] = screen.getAllByRole('spinbutton');
    fireEvent.keyDown(minute!, { key: 'Backspace' });
    fireEvent.keyDown(minute!, { key: 'Backspace' });
    fireEvent.keyDown(hour!, { key: 'Backspace' });
    fireEvent.keyDown(hour!, { key: 'Backspace' });

    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('passes the edited value to onBlur when uncontrolled', () => {
    const onBlur = jest.fn();
    render(
      <>
        <TimeInput
          aria-label="Drink time"
          defaultValue="14:30"
          onBlur={onBlur}
        />
        <button type="button">elsewhere</button>
      </>
    );

    const minute = screen.getAllByRole('spinbutton')[1]!;
    act(() => minute.focus());
    fireEvent.keyDown(minute, { key: 'ArrowUp' });
    act(() => screen.getByRole('button', { name: 'elsewhere' }).focus());

    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledWith('14:31');
  });

  it('does not call onBlur when focus moves between its own segments', () => {
    const onBlur = jest.fn();
    render(
      <TimeInput aria-label="Drink time" defaultValue="14:30" onBlur={onBlur} />
    );

    const [hour, minute] = screen.getAllByRole('spinbutton');
    act(() => hour!.focus());
    act(() => minute!.focus());

    expect(onBlur).not.toHaveBeenCalled();
  });

  it('forwards Enter and Escape to onKeyDown', () => {
    const keys: string[] = [];
    render(
      <TimeInput
        aria-label="Drink time"
        defaultValue="14:30"
        onKeyDown={(e) => keys.push(e.key)}
      />
    );

    const hour = screen.getAllByRole('spinbutton')[0]!;
    fireEvent.keyDown(hour, { key: 'Enter' });
    fireEvent.keyDown(hour, { key: 'Escape' });

    expect(keys).toEqual(['Enter', 'Escape']);
  });

  it('is named by an external label through aria-labelledby', () => {
    render(
      <>
        <span id="entry-time-label">Time</span>
        <TimeInput
          aria-labelledby="entry-time-label"
          value="14:30"
          onChange={jest.fn()}
        />
      </>
    );

    expect(screen.getByRole('group', { name: 'Time' })).toBeInTheDocument();
  });
});

describe('DateTimeInput', () => {
  beforeEach(() => {
    mockTimeFormat = 'HH:mm';
  });

  it('renders the time part in 24-hour form when the preference is HH:mm', () => {
    render(
      <DateTimeInput
        aria-label="Start time"
        value="2026-10-18T14:30"
        onChange={jest.fn()}
      />
    );

    const texts = segmentTexts();
    expect(texts).toEqual(expect.arrayContaining(['2026', '14', '30']));
    expect(texts).not.toContain('PM');
  });

  it('renders the time part with AM/PM when the preference is 12-hour', () => {
    mockTimeFormat = 'h:mm A';
    render(
      <DateTimeInput
        aria-label="Start time"
        value="2026-10-18T14:30"
        onChange={jest.fn()}
      />
    );

    expect(segmentTexts()).toEqual(expect.arrayContaining(['2', '30', 'PM']));
  });

  it('emits YYYY-MM-DDTHH:mm, the same format as datetime-local', () => {
    const onChange = jest.fn();
    render(
      <DateTimeInput
        aria-label="Start time"
        value="2026-10-18T14:30"
        onChange={onChange}
      />
    );

    const minute = screen
      .getAllByRole('spinbutton')
      .find((segment) => segment.textContent === '30')!;
    fireEvent.keyDown(minute, { key: 'ArrowUp' });

    expect(onChange).toHaveBeenLastCalledWith('2026-10-18T14:31');
  });
});

describe('browser picker button', () => {
  // The picker input, not the library's own hidden form input.
  const nativeInput = (container: HTMLElement, type: string) =>
    container.querySelector<HTMLInputElement>(
      `input[type="${type}"][aria-hidden="true"]`
    )!;

  afterEach(() => {
    // jsdom has no showPicker; tests that need one install it.
    delete (HTMLInputElement.prototype as Partial<HTMLInputElement>).showPicker;
  });

  it('opens the browser picker of a hidden native time input', () => {
    const showPicker = jest.fn();
    HTMLInputElement.prototype.showPicker = showPicker;
    const { container } = render(
      <TimeInput aria-label="Meal time" value="14:30" onChange={jest.fn()} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pick a time' }));

    expect(showPicker).toHaveBeenCalledTimes(1);
    expect(showPicker.mock.contexts[0]).toBe(nativeInput(container, 'time'));
    expect(nativeInput(container, 'time')).toHaveValue('14:30');
  });

  it('applies a time chosen in the browser picker to the field', () => {
    const onChange = jest.fn();
    const { container } = render(
      <ControlledTimeInput initial="14:30" onChange={onChange} />
    );

    fireEvent.change(nativeInput(container, 'time'), {
      target: { value: '18:45' },
    });

    expect(onChange).toHaveBeenLastCalledWith('18:45');
    expect(segmentTexts()).toEqual(['18', '45']);
  });

  it('focuses the field for typing when the browser has no picker', () => {
    render(
      <TimeInput aria-label="Meal time" value="14:30" onChange={jest.fn()} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pick a time' }));

    expect(screen.getAllByRole('spinbutton')[0]).toHaveFocus();
  });

  it('does not count using the picker as leaving the field', () => {
    HTMLInputElement.prototype.showPicker = jest.fn();
    const onBlur = jest.fn();
    const { container } = render(
      <TimeInput aria-label="Drink time" defaultValue="14:30" onBlur={onBlur} />
    );
    const pickerButton = screen.getByRole('button', { name: 'Pick a time' });

    act(() => screen.getAllByRole('spinbutton')[0]!.focus());
    // Pressing the button must not move focus out of the field.
    expect(fireEvent.mouseDown(pickerButton)).toBe(false);
    fireEvent.click(pickerButton);
    fireEvent.change(nativeInput(container, 'time'), {
      target: { value: '07:15' },
    });
    act(() => pickerButton.focus());

    expect(onBlur).not.toHaveBeenCalled();
  });

  it('reports the value picked in the browser picker when the field is left', () => {
    const onBlur = jest.fn();
    const { container } = render(
      <>
        <TimeInput
          aria-label="Drink time"
          defaultValue="14:30"
          onBlur={onBlur}
        />
        <button type="button">elsewhere</button>
      </>
    );

    act(() => screen.getAllByRole('spinbutton')[0]!.focus());
    fireEvent.change(nativeInput(container, 'time'), {
      target: { value: '07:15' },
    });
    act(() => screen.getByRole('button', { name: 'elsewhere' }).focus());

    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledWith('07:15');
  });

  it('opens a native datetime-local picker for DateTimeInput', () => {
    const showPicker = jest.fn();
    HTMLInputElement.prototype.showPicker = showPicker;
    const onChange = jest.fn();
    const { container } = render(
      <DateTimeInput
        aria-label="Start time"
        value="2026-10-18T14:30"
        onChange={onChange}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Pick a date and time' })
    );
    fireEvent.change(nativeInput(container, 'datetime-local'), {
      target: { value: '2026-10-20T07:05' },
    });

    expect(showPicker.mock.contexts[0]).toBe(
      nativeInput(container, 'datetime-local')
    );
    expect(onChange).toHaveBeenLastCalledWith('2026-10-20T07:05');
  });

  it('disables the picker button with the field', () => {
    render(
      <TimeInput
        aria-label="Meal time"
        value="14:30"
        onChange={jest.fn()}
        disabled
      />
    );

    expect(screen.getByRole('button', { name: 'Pick a time' })).toBeDisabled();
  });
});

describe('required fields', () => {
  it.each([
    ['TimeInput', TimeInput, '14:30'],
    ['DateTimeInput', DateTimeInput, '2026-10-18T14:30'],
  ] as const)(
    '%s blocks form submission while empty, like a native required input',
    (_name, Field, filled) => {
      const { container, rerender } = render(
        <form>
          <Field
            aria-label="Start time"
            value=""
            onChange={jest.fn()}
            required
          />
        </form>
      );
      const form = container.querySelector('form')!;

      expect(form.checkValidity()).toBe(false);

      rerender(
        <form>
          <Field
            aria-label="Start time"
            value={filled}
            onChange={jest.fn()}
            required
          />
        </form>
      );
      expect(form.checkValidity()).toBe(true);
    }
  );
});

describe('required field message', () => {
  it.each([
    ['TimeInput', TimeInput],
    ['DateTimeInput', DateTimeInput],
  ] as const)(
    '%s keeps an empty required field on a visible, described segment',
    (_name, Field) => {
      const onSubmit = jest.fn();
      const { container } = render(
        <form onSubmit={onSubmit}>
          <Field aria-label="End time" value="" onChange={jest.fn()} required />
        </form>
      );

      act(() => container.querySelector('form')!.requestSubmit());

      expect(onSubmit).not.toHaveBeenCalled();
      // Focus goes to the first visible segment, never the hidden picker input.
      const firstSegment = screen.getAllByRole('spinbutton')[0]!;
      expect(firstSegment).toHaveFocus();
      expect(
        container.querySelector('input[aria-hidden="true"]')
      ).not.toBeRequired();
      // The field is marked invalid and its message is linked for screen
      // readers, so it is announced with the field.
      const group = screen.getByRole('group', { name: 'End time' });
      expect(group).toHaveAttribute('data-invalid');
      const message = container.querySelector('[slot="errorMessage"]');
      expect(message).toBeInTheDocument();
      expect(firstSegment.getAttribute('aria-describedby')).toContain(
        message!.id
      );
    }
  );
});
