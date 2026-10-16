import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import RunProgramSelect from '../../src/components/recording/RunProgramSelect';
import { programStatus } from '@workspace/shared';

const status = programStatus({ programId: 'beginner5k', next: 4 })!;

describe('RunProgramSelect', () => {
  it('shows nothing until the program has loaded', () => {
    render(
      <RunProgramSelect
        status={null}
        loaded={false}
        selected={false}
        onSelect={jest.fn()}
        onManage={jest.fn()}
      />
    );
    expect(screen.queryByTestId('run-program-select')).toBeNull();
  });

  it('points to the Training programs screen when there is no program', () => {
    const onManage = jest.fn();
    render(
      <RunProgramSelect
        status={null}
        loaded
        selected={false}
        onSelect={jest.fn()}
        onManage={onManage}
      />
    );
    fireEvent.press(screen.getByText('Set up a program'));
    expect(onManage).toHaveBeenCalled();
  });

  it("offers today's workout to use and a way to manage the program", () => {
    const onSelect = jest.fn();
    const onManage = jest.fn();
    render(
      <RunProgramSelect
        status={status}
        loaded
        selected={false}
        onSelect={onSelect}
        onManage={onManage}
      />
    );
    expect(screen.getByText(/Beginner 5K · Week 2, run 2/)).toBeTruthy();
    fireEvent.press(screen.getByText('Do this workout'));
    expect(onSelect).toHaveBeenCalled();
    fireEvent.press(screen.getByText('Manage'));
    expect(onManage).toHaveBeenCalled();
  });

  it('says so when the workout is already chosen', () => {
    render(
      <RunProgramSelect
        status={status}
        loaded
        selected
        onSelect={jest.fn()}
        onManage={jest.fn()}
      />
    );
    expect(screen.getByText('Using this workout')).toBeTruthy();
  });
});
