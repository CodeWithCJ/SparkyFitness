import React from 'react';
import { render } from '@testing-library/react-native';

import SettingsRow from '../../src/components/SettingsRow';

const SUBTITLE = 'Repeat each reminder every 10 minutes, up to 3 times, until the dose is logged.';

describe('SettingsRow', () => {
  it('clamps string subtitles to one line by default', () => {
    const { getByText } = render(<SettingsRow title="Repeat Reminders" subtitle={SUBTITLE} />);

    expect(getByText(SUBTITLE).props.numberOfLines).toBe(1);
  });

  it('lets string subtitles wrap when subtitleNumberOfLines is 0', () => {
    const { getByText } = render(
      <SettingsRow title="Repeat Reminders" subtitle={SUBTITLE} subtitleNumberOfLines={0} />,
    );

    expect(getByText(SUBTITLE).props.numberOfLines).toBe(0);
  });
});
