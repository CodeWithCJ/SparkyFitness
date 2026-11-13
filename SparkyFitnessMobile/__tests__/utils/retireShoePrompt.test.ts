import { Alert } from 'react-native';
import type { TFunction } from 'i18next';
import { promptToRetireShoe } from '../../src/utils/retireShoePrompt';

const t = ((_key: string, options?: { defaultValue?: string; name?: string }) =>
  (options?.defaultValue ?? '').replace(
    '{{name}}',
    options?.name ?? ''
  )) as unknown as TFunction;

describe('promptToRetireShoe', () => {
  it('names the pair and retires it when confirmed', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onRetire = jest.fn();
    promptToRetireShoe(t, { name: 'Pegasus 41', nickname: 'Daily' }, onRetire);

    const [, message, buttons] = alert.mock.calls[0]!;
    expect(message).toContain('Daily');
    expect(onRetire).not.toHaveBeenCalled();
    buttons?.find((button) => button.text === 'Retire')?.onPress?.();
    expect(onRetire).toHaveBeenCalledTimes(1);
  });

  it('does nothing on Not now', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onRetire = jest.fn();
    promptToRetireShoe(t, { name: 'Pegasus 41', nickname: null }, onRetire);

    const [, , buttons] = alert.mock.calls[0]!;
    const notNow = buttons?.find((button) => button.text === 'Not now');
    expect(notNow?.style).toBe('cancel');
    expect(onRetire).not.toHaveBeenCalled();
  });
});
