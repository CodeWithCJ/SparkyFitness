import { fireEvent, render } from '@testing-library/react-native';
import DiaryEntrySelectionBar from '../../src/components/DiaryEntrySelectionBar';

it('opens the move picker without forwarding the native press event', () => {
  const openMove = jest.fn();
  const screen = render(
    <DiaryEntrySelectionBar
      selectedCount={2}
      isPending={false}
      cancelSelection={jest.fn()}
      confirmDelete={jest.fn()}
      openMove={openMove}
    />
  );

  fireEvent.press(screen.getByText('Move'), {
    nativeEvent: { pageX: 100, pageY: 40 },
  });

  expect(openMove).toHaveBeenCalledWith();
});
