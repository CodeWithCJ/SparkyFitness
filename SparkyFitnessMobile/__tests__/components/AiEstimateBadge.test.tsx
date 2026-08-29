import React from 'react';
import { render, screen } from '@testing-library/react-native';
import AiEstimateBadge from '../../src/components/AiEstimateBadge';

describe('AiEstimateBadge', () => {
  it('renders with accessible role and accessibility label', () => {
    render(<AiEstimateBadge />);

    const badge = screen.getByTestId('ai-estimate-badge');
    expect(badge).toBeTruthy();
    expect(badge.props.accessible).toBe(true);
    expect(badge.props.accessibilityRole).toBe('text');
    expect(badge.props.accessibilityLabel).toBe('Nutrition estimated by AI');
    expect(screen.getByText('AI estimate')).toBeTruthy();
  });
});
