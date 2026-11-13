import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { RUN_PROGRAMS } from '@workspace/shared';
import RunProgramGuide, {
  programRest,
  programStructure,
} from '../../src/components/recording/RunProgramGuide';
import i18n from '../../src/localization/i18n';

describe('RunProgramGuide', () => {
  it('is collapsed until opened, then explains workouts, effort and walking pace', () => {
    render(<RunProgramGuide />);
    expect(screen.queryByText('How fast to walk')).toBeNull();
    fireEvent.press(screen.getByText('How the plans work'));
    expect(screen.getByText('Each workout')).toBeTruthy();
    expect(screen.getByText('How hard to run')).toBeTruthy();
    expect(screen.getByText('How fast to walk')).toBeTruthy();
    expect(screen.getByText(/about 5 to 6 km\/h/)).toBeTruthy();
  });

  it('can start open and describes the program being followed', () => {
    render(<RunProgramGuide programId="beginner5k" defaultOpen />);
    expect(screen.getByText('Beginner 5K')).toBeTruthy();
    expect(screen.getByText(/Weeks 7 to 9 are continuous runs/)).toBeTruthy();
  });

  it('explains strides, hills, tempo and marathon pace, and pace ranges', () => {
    render(<RunProgramGuide defaultOpen />);
    expect(
      screen.getByText('Strides, hills, tempo and marathon pace')
    ).toBeTruthy();
    expect(
      screen.getByText(/A stride is a short, quick, relaxed effort/)
    ).toBeTruthy();
    expect(screen.getByText('Pace ranges')).toBeTruthy();
    expect(screen.getByText(/under Your race pace/)).toBeTruthy();
  });

  it('describes every program', () => {
    for (const program of RUN_PROGRAMS) {
      expect(
        programStructure(i18n.t.bind(i18n), program.id).length
      ).toBeGreaterThan(20);
    }
  });

  it('gives rest-day advice for every program', () => {
    for (const program of RUN_PROGRAMS) {
      expect(programRest(i18n.t.bind(i18n), program.id).length).toBeGreaterThan(
        20
      );
    }
    render(<RunProgramGuide programId="beginner5k" defaultOpen />);
    expect(screen.getByText('Rest days')).toBeTruthy();
    expect(screen.getByText(/back-to-back days/)).toBeTruthy();
  });

  it('explains Zone 2 and the zone check for the Zone 2 programs only', () => {
    const { unmount } = render(
      <RunProgramGuide programId="zone2Base" defaultOpen />
    );
    expect(screen.getByText('Zone 2 runs')).toBeTruthy();
    expect(screen.getByText(/talk test/)).toBeTruthy();
    expect(
      screen.getByText(/Weeks 4, 8 and 10 each have a zone check/)
    ).toBeTruthy();
    unmount();
    render(<RunProgramGuide programId="beginner5k" defaultOpen />);
    expect(screen.queryByText('Zone 2 runs')).toBeNull();
  });
});
