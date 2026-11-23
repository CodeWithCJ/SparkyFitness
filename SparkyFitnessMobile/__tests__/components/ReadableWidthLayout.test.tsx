import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import {
  DASHBOARD_CONTENT_MAX_WIDTH,
  READABLE_CONTENT_MAX_WIDTH,
  ReadableWidthLayout,
  readableMaxWidthForRoute,
} from '../../src/components/ReadableWidthLayout';

describe('readableMaxWidthForRoute', () => {
  it('keeps cameras, maps and the tab container edge to edge', () => {
    expect(readableMaxWidthForRoute('Tabs')).toBeNull();
    expect(readableMaxWidthForRoute('FoodScan')).toBeNull();
    expect(readableMaxWidthForRoute('RecordActivity')).toBeNull();
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
});
