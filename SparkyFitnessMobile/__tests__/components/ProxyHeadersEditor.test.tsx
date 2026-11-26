import React, { useState } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ProxyHeadersEditor from '../../src/components/ProxyHeadersEditor';
import type { ProxyHeader } from '../../src/services/storage';

jest.mock('../../src/components/Icon', () => 'Icon');

// A controlled wrapper so removal/re-render behaves like a real consumer
// (the component itself holds no header state).
const ControlledEditor = ({ initial }: { initial: ProxyHeader[] }) => {
  const [headers, setHeaders] = useState(initial);
  return <ProxyHeadersEditor headers={headers} onHeadersChange={setHeaders} />;
};

describe('ProxyHeadersEditor', () => {
  it('shows the help text when there are no headers', () => {
    const result = render(
      <ProxyHeadersEditor headers={[]} onHeadersChange={jest.fn()} />
    );

    expect(
      result.getByText('Used when running behind certain reverse proxies')
    ).toBeTruthy();
  });

  it('hides the help text once a header row exists', () => {
    const headers: ProxyHeader[] = [{ name: 'X-Auth', value: 'abc' }];
    const result = render(
      <ProxyHeadersEditor headers={headers} onHeadersChange={jest.fn()} />
    );

    expect(
      result.queryByText('Used when running behind certain reverse proxies')
    ).toBeNull();
  });

  it('adds an empty header row when the add button is pressed', () => {
    const onHeadersChange = jest.fn();
    const result = render(
      <ProxyHeadersEditor headers={[]} onHeadersChange={onHeadersChange} />
    );

    fireEvent.press(result.getByLabelText('Add header'));

    expect(onHeadersChange).toHaveBeenCalledWith([{ name: '', value: '' }]);
  });

  it('updates the name field for the right row', () => {
    const onHeadersChange = jest.fn();
    const headers: ProxyHeader[] = [
      { name: '', value: '' },
      { name: 'X-Other', value: 'other' },
    ];
    const result = render(
      <ProxyHeadersEditor headers={headers} onHeadersChange={onHeadersChange} />
    );

    fireEvent.changeText(
      result.getAllByPlaceholderText('Name (e.g. X-Access-Token)')[0],
      'X-Access-Token'
    );

    expect(onHeadersChange).toHaveBeenCalledWith([
      { name: 'X-Access-Token', value: '' },
      { name: 'X-Other', value: 'other' },
    ]);
  });

  it('updates the value field for the right row', () => {
    const onHeadersChange = jest.fn();
    const headers: ProxyHeader[] = [{ name: 'X-Access-Token', value: '' }];
    const result = render(
      <ProxyHeadersEditor headers={headers} onHeadersChange={onHeadersChange} />
    );

    fireEvent.changeText(result.getByPlaceholderText('Value'), 'secret');

    expect(onHeadersChange).toHaveBeenCalledWith([
      { name: 'X-Access-Token', value: 'secret' },
    ]);
  });

  it('removes a header row when its remove button is pressed', () => {
    const onHeadersChange = jest.fn();
    const headers: ProxyHeader[] = [
      { name: 'X-Access-Token', value: 'secret' },
      { name: 'X-Other', value: 'other' },
    ];
    const result = render(
      <ProxyHeadersEditor headers={headers} onHeadersChange={onHeadersChange} />
    );

    fireEvent.press(result.getByLabelText('Remove header 1'));

    expect(onHeadersChange).toHaveBeenCalledWith([
      { name: 'X-Other', value: 'other' },
    ]);
  });

  it('starts the value hidden and reveals it on toggle', () => {
    const headers: ProxyHeader[] = [
      { name: 'X-Access-Token', value: 'secret' },
    ];
    const result = render(
      <ProxyHeadersEditor headers={headers} onHeadersChange={jest.fn()} />
    );

    const valueInput = result.getByPlaceholderText('Value');
    expect(valueInput.props.secureTextEntry).toBe(true);

    fireEvent.press(result.getByLabelText('Show header value'));

    expect(result.getByPlaceholderText('Value').props.secureTextEntry).toBe(
      false
    );
    expect(result.getByLabelText('Hide header value')).toBeTruthy();
  });

  it('re-hides every row after a removal shifts indices', () => {
    const headers: ProxyHeader[] = [
      { name: 'X-Visible', value: 'shown' },
      { name: 'X-Hidden', value: 'secret' },
    ];
    const result = render(<ControlledEditor initial={headers} />);

    // Reveal the first row only; the second stays hidden.
    fireEvent.press(result.getAllByLabelText('Show header value')[0]);
    expect(
      result.getAllByPlaceholderText('Value')[0].props.secureTextEntry
    ).toBe(false);
    expect(
      result.getAllByPlaceholderText('Value')[1].props.secureTextEntry
    ).toBe(true);

    // Removing the first row shifts the second into index 0. It must not
    // inherit the removed row's "revealed" state.
    fireEvent.press(result.getByLabelText('Remove header 1'));

    expect(result.getByPlaceholderText('Value').props.secureTextEntry).toBe(
      true
    );
  });
});
