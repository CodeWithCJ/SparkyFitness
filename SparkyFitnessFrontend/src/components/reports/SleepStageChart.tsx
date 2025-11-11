import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer } from 'recharts';
import { SleepChartData, SLEEP_STAGE_COLORS } from '@/types';
import { usePreferences } from '@/contexts/PreferencesContext';
import ZoomableChart from '../ZoomableChart';
import { useTheme } from '@/contexts/ThemeContext';

interface SleepStageChartProps {
  sleepChartData: SleepChartData;
}

const CHART_HEIGHT = 200;
const CHART_PADDING_VERTICAL = 20;
const STAGE_HEIGHT = (CHART_HEIGHT - 2 * CHART_PADDING_VERTICAL) / 4;
const BAR_HEIGHT = STAGE_HEIGHT * 0.6; // Height of the actual colored bar
const BAR_VERTICAL_OFFSET = (STAGE_HEIGHT - BAR_HEIGHT) / 2; // Offset to center the bar within its stage row
const LINE_WIDTH = 2; // Width of connecting lines

const stageYPositions: { [key: string]: number } = {
  awake: CHART_PADDING_VERTICAL,
  rem: CHART_PADDING_VERTICAL + STAGE_HEIGHT,
  light: CHART_PADDING_VERTICAL + 2 * STAGE_HEIGHT,
  deep: CHART_PADDING_VERTICAL + 3 * STAGE_HEIGHT,
};

const stageLabels: { [key: string]: string } = {
  awake: 'Awake',
  rem: 'REM',
  light: 'Core', // Using 'Core' as per iPhone chart
  deep: 'Deep',
};

const SleepStageChart: React.FC<SleepStageChartProps> = ({ sleepChartData }) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone, dateFormat } = usePreferences();
  const { theme } = useTheme();

  if (!sleepChartData || !sleepChartData.segments || sleepChartData.segments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("sleepReport.sleepHypnogram", "Sleep Hypnogram")} - {formatDateInUserTimezone(sleepChartData.date, dateFormat)}</CardTitle>
        </CardHeader>
        <CardContent>
          <p>{t("sleepReport.noSleepStageDataAvailable", "No sleep stage data available for this entry.")}</p>
        </CardContent>
      </Card>
    );
  }

  const sortedSegments = sleepChartData.segments
    .filter(segment => stageYPositions[segment.stage_type] !== undefined) // Filter out unknown stages
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  const minTime = Math.min(...sortedSegments.map(s => new Date(s.start_time).getTime()));
  const maxTime = Math.max(...sortedSegments.map(s => new Date(s.end_time).getTime()));
  const totalDurationMs = maxTime - minTime;

  // Use a fixed width for the SVG to allow for zooming, similar to the Recharts approach
  const SVG_BASE_WIDTH = 800; // Base width for calculations, will be scaled by ResponsiveContainer

  const getX = (timeMs: number) => {
    if (totalDurationMs === 0) return 0; // Avoid division by zero
    return ((timeMs - minTime) / totalDurationMs) * SVG_BASE_WIDTH;
  };

  const renderSegments = () => {
    return sortedSegments.map((segment, index) => {
      const startX = getX(new Date(segment.start_time).getTime());
      const endX = getX(new Date(segment.end_time).getTime());
      const width = endX - startX;
      const y = stageYPositions[segment.stage_type] + BAR_VERTICAL_OFFSET;
      const color = SLEEP_STAGE_COLORS[segment.stage_type];

      return (
        <rect
          key={segment.id || `segment-${index}`}
          x={startX}
          y={y}
          width={width}
          height={BAR_HEIGHT}
          fill={color}
          rx={4} // Rounded corners for the bars
          ry={4}
        />
      );
    });
  };

  const renderConnectingLines = () => {
    const lines: React.JSX.Element[] = [];
    for (let i = 0; i < sortedSegments.length - 1; i++) {
      const current = sortedSegments[i];
      const next = sortedSegments[i + 1];

      const currentEndX = getX(new Date(current.end_time).getTime());
      const nextStartX = getX(new Date(next.start_time).getTime());

      // Only draw connecting lines if there's a gap or stage change
      if (current.stage_type !== next.stage_type || currentEndX < nextStartX) {
        const y1 = stageYPositions[current.stage_type] + BAR_VERTICAL_OFFSET + BAR_HEIGHT / 2;
        const y2 = stageYPositions[next.stage_type] + BAR_VERTICAL_OFFSET + BAR_HEIGHT / 2;

        // Draw vertical line from current stage end to next stage start
        lines.push(
          <line
            key={`v-line-${i}`}
            x1={currentEndX}
            y1={y1}
            x2={currentEndX}
            y2={y2}
            stroke={theme === 'dark' ? 'white' : 'black'}
            strokeWidth={LINE_WIDTH}
          />
        );

        // Draw horizontal line if there's a time gap between segments at the same stage level
        if (currentEndX < nextStartX && current.stage_type === next.stage_type) {
          lines.push(
            <line
              key={`h-line-gap-${i}`}
              x1={currentEndX}
              y1={y1}
              x2={nextStartX}
              y2={y1}
              stroke={theme === 'dark' ? 'white' : 'black'}
              strokeWidth={LINE_WIDTH}
              strokeDasharray="4 4"
            />
          );
        }
      }
    }
    return lines;
  };

  const renderGridAndLabels = () => {
    const gridLines: React.JSX.Element[] = [];
    const timeLabels: React.JSX.Element[] = [];
    const stageLabelsElements: React.JSX.Element[] = [];

    // Horizontal grid lines and stage labels
    Object.entries(stageYPositions).forEach(([stageType, yPos]) => {
      gridLines.push(
        <line
          key={`h-grid-${stageType}`}
          x1="0"
          y1={yPos + STAGE_HEIGHT / 2}
          x2={SVG_BASE_WIDTH}
          y2={yPos + STAGE_HEIGHT / 2}
          stroke="#444"
          strokeDasharray="2 2"
          strokeWidth="0.5"
        />
      );
      stageLabelsElements.push(
        <text
          key={`stage-label-${stageType}`}
          x="-10" // Position to the left of the chart
          y={yPos + STAGE_HEIGHT / 2 + 5} // Center vertically
          textAnchor="end"
          fill={theme === 'dark' ? 'white' : 'black'}
          fontSize="12"
        >
          {t(`sleepAnalyticsCharts.${stageType === 'light' ? 'core' : stageType}`, stageLabels[stageType])}
        </text>
      );
    });

    // Vertical grid lines and time labels
    const numTimeLabels = 5; // Number of time labels to display
    for (let i = 0; i <= numTimeLabels; i++) {
      const timeMs = minTime + (totalDurationMs / numTimeLabels) * i;
      const xPos = getX(timeMs);
      const date = new Date(timeMs);
      const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

      gridLines.push(
        <line
          key={`v-grid-${i}`}
          x1={xPos}
          y1={CHART_PADDING_VERTICAL}
          x2={xPos}
          y2={CHART_HEIGHT - CHART_PADDING_VERTICAL}
          stroke="#444"
          strokeDasharray="2 2"
          strokeWidth="0.5"
        />
      );
      timeLabels.push(
        <text
          key={`time-label-${i}`}
          x={xPos}
          y={CHART_HEIGHT - CHART_PADDING_VERTICAL + 15} // Position below the chart
          textAnchor="middle"
          fill={theme === 'dark' ? 'white' : 'black'}
          fontSize="12"
        >
          {timeString}
        </text>
      );
    }

    return (
      <g>
        {gridLines}
        {stageLabelsElements}
        {timeLabels}
      </g>
    );
  };

  return (
    <ZoomableChart title={t("sleepReport.sleepHypnogram", "Sleep Hypnogram")}>
      {(isMaximized, zoomLevel) => (
        <Card>
          <CardHeader>
            <CardTitle>{t("sleepReport.sleepHypnogram", "Sleep Hypnogram")} - {formatDateInUserTimezone(sleepChartData.date, dateFormat)}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap justify-center gap-x-4 gap-y-2">
              {Object.entries(stageLabels).map(([stageKey, stageLabel]) => {
                const totalDurationSeconds = sortedSegments
                  .filter(s => s.stage_type === stageKey)
                  .reduce((acc, s) => acc + (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 1000, 0);

                if (totalDurationSeconds === 0) return null;

                const hours = Math.floor(totalDurationSeconds / 3600);
                const minutes = Math.floor((totalDurationSeconds % 3600) / 60);
                const durationString = `${hours}h ${minutes}m`;

                return (
                  <div key={stageKey} className="flex items-center text-sm">
                    <span
                      className="mr-2 h-3 w-3 rounded-full"
                      style={{ backgroundColor: SLEEP_STAGE_COLORS[stageKey] }}
                    ></span>
                    <span>{t(`sleepAnalyticsCharts.${stageKey === 'light' ? 'core' : stageKey}`, stageLabel)}: <strong>{durationString}</strong></span>
                  </div>
                );
              })}
            </div>
            <div className={isMaximized ? "h-[calc(95vh-200px)]" : "h-48"}>
              <ResponsiveContainer width={isMaximized ? `${100 * zoomLevel}%` : "100%"} height="100%">
                <svg
                  viewBox={`0 0 ${SVG_BASE_WIDTH} ${CHART_HEIGHT + 30}`}
                  preserveAspectRatio="xMidYMid meet"
                  style={{ overflow: 'visible' }}
                >
                  <rect x="0" y="0" width={SVG_BASE_WIDTH} height={CHART_HEIGHT + 30} fill={theme === 'dark' ? 'black' : 'white'} />
                  {renderGridAndLabels()}
                  {renderConnectingLines()}
                  {renderSegments()}
                </svg>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </ZoomableChart>
  );
};

export default SleepStageChart;