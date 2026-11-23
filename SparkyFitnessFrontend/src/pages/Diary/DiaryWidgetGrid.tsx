import type { ComponentType, ReactNode } from 'react';
import WidgetGrid from '@/components/widgets/WidgetGrid';
import {
  generateDefaultLayouts,
  isMealWidgetKey,
  type DashboardLayouts,
} from '@/utils/dashboardLayout';

export interface DiaryWidget {
  key: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  render: () => ReactNode;
  /** Drop the frame outside edit mode (meal cards form one timeline). */
  seamless?: boolean;
}

interface DiaryWidgetGridProps {
  widgets: DiaryWidget[];
  toolbarContainer?: HTMLElement | null;
}

const PAGE_KEY = 'diary';

const diaryDefaultLayouts = (widgetKeys: string[]): DashboardLayouts =>
  generateDefaultLayouts(widgetKeys.filter(isMealWidgetKey));

const DiaryWidgetGrid = ({
  widgets,
  toolbarContainer,
}: DiaryWidgetGridProps) => (
  <WidgetGrid
    pageKey={PAGE_KEY}
    widgets={widgets}
    generateDefaultLayouts={diaryDefaultLayouts}
    toolbarContainer={toolbarContainer}
  />
);

export default DiaryWidgetGrid;
