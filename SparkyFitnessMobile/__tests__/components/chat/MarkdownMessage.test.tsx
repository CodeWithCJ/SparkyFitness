import React from 'react';
import { Linking } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import MarkdownMessage from '../../../src/components/chat/MarkdownMessage';

// react-native-enriched-markdown is mocked in jest.setup.js to render its
// `markdown` prop as Text (testID "enriched-markdown") and forward onLinkPress,
// so these tests assert what MarkdownMessage actually hands the native renderer.

describe('MarkdownMessage', () => {
  it('passes complete markdown through unchanged', () => {
    const { getByTestId } = render(<MarkdownMessage text="**done** and more" />);
    expect(getByTestId('enriched-markdown').props.children).toBe('**done** and more');
  });

  it('repairs partial markdown from streaming via remend', () => {
    // An unclosed bold token mid-stream is completed so it renders as bold
    // rather than literal asterisks.
    const { getByTestId } = render(<MarkdownMessage text="**bol" />);
    expect(getByTestId('enriched-markdown').props.children).toBe('**bol**');
  });

  it('drops a half-streamed link to plain text (linkMode text-only)', () => {
    const { getByTestId } = render(<MarkdownMessage text="see [docs](htt" />);
    expect(getByTestId('enriched-markdown').props.children).toBe('see docs');
  });

  it('opens tapped links via Linking', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { getByTestId } = render(<MarkdownMessage text="hi" />);
    fireEvent(getByTestId('enriched-markdown'), 'linkPress', { url: 'https://example.com' });
    expect(openURL).toHaveBeenCalledWith('https://example.com');
    openURL.mockRestore();
  });
});
