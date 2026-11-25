import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import {
  DASHBOARD_CONTENT_MAX_WIDTH,
  READABLE_CONTENT_MAX_WIDTH,
  ReadableWidthLayout,
  readableMaxWidthForRoute,
} from '../../src/components/ReadableWidthLayout';

describe('readableMaxWidthForRoute', () => {
  it('keeps cameras, maps, the active workout and the tab container edge to edge', () => {
    expect(readableMaxWidthForRoute('Tabs')).toBeNull();
    expect(readableMaxWidthForRoute('FoodScan')).toBeNull();
    expect(readableMaxWidthForRoute('RecordActivity')).toBeNull();
    expect(readableMaxWidthForRoute('ActiveWorkout')).toBeNull();
  });

  it('gives the Dashboard a wider column than other screens', () => {
    expect(readableMaxWidthForRoute('Dashboard')).toBe(
      DASHBOARD_CONTENT_MAX_WIDTH
    );
    expect(readableMaxWidthForRoute('DashboardRoot')).toBe(
      DASHBOARD_CONTENT_MAX_WIDTH
    );
    expect(readableMaxWidthForRoute('FoodSearch')).toBe(
      READABLE_CONTENT_MAX_WIDTH
    );
  });
});

describe('ReadableWidthLayout', () => {
  it('renders its screen in both modes', () => {
    render(
      <>
        <ReadableWidthLayout routeName="Diary">
          <Text>column</Text>
        </ReadableWidthLayout>
        <ReadableWidthLayout routeName="Tabs">
          <Text>full</Text>
        </ReadableWidthLayout>
      </>
    );
    expect(screen.getByText('column')).toBeTruthy();
    expect(screen.getByText('full')).toBeTruthy();
  });

  it('centres a screen in a column no wider than its route allows', () => {
    const { toJSON } = render(
      <ReadableWidthLayout routeName="Diary">
        <Text>column</Text>
      </ReadableWidthLayout>
    );
    const root = toJSON();
    expect(root).not.toBeNull();
    expect(Array.isArray(root)).toBe(false);
    if (!root || Array.isArray(root)) return;
    expect(root.type).toBe('View');
    expect(StyleSheet.flatten(root.props.style)).toMatchObject({
      maxWidth: READABLE_CONTENT_MAX_WIDTH,
      width: '100%',
      alignSelf: 'center',
    });
  });

  it('adds no wrapper for an edge-to-edge route', () => {
    const { toJSON } = render(
      <ReadableWidthLayout routeName="FoodScan">
        <Text>full</Text>
      </ReadableWidthLayout>
    );
    const root = toJSON();
    expect(root).not.toBeNull();
    expect(Array.isArray(root)).toBe(false);
    if (!root || Array.isArray(root)) return;
    expect(root.type).toBe('Text');
  });
});
