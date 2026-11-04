import type { ComponentType, ReactNode } from 'react';
import type { DiaryViewMode } from '@/utils/diaryTimeline';
import WidgetGrid from '@/components/widgets/WidgetGrid';
import { diaryDefaultLayouts } from '@/utils/dashboardLayout';

export interface DiaryWidget {
  key: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  render: () => ReactNode;
}

interface DiaryWidgetGridProps {
  widgets: DiaryWidget[];
  toolbarContainer?: HTMLElement | null;
  viewMode: DiaryViewMode;
}

// Each view keeps its own saved layout: the timeline view has no meal tiles,
// so sharing one row would drop the user's meal arrangement on every switch.
const PAGE_KEYS: Record<DiaryViewMode, string> = {
  meals: 'diary',
  timeline: 'diary-timeline',
};

const DiaryWidgetGrid = ({
  widgets,
  toolbarContainer,
  viewMode,
}: DiaryWidgetGridProps) => (
  <WidgetGrid
    key={viewMode}
    pageKey={PAGE_KEYS[viewMode]}
    widgets={widgets}
    generateDefaultLayouts={diaryDefaultLayouts}
    toolbarContainer={toolbarContainer}
  />
);

export default DiaryWidgetGrid;
