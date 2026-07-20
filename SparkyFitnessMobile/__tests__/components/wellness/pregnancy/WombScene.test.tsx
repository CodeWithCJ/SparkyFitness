import React from 'react';
import { render } from '@testing-library/react-native';
import WombScene from '../../../../src/components/wellness/pregnancy/WombScene';

describe('WombScene', () => {
  it('renders each committed trimester stage without crashing', () => {
    ([8, 20, 36] as const).forEach((scene) => {
      expect(() => render(<WombScene scene={scene} />)).not.toThrow();
    });
  });
});
