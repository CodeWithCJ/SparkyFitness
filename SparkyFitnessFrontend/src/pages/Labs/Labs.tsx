import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileUp, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  LAB_MARKER_PRESETS,
  buildLabMarkers,
  effectiveLabRange,
  labHistoryPoints,
  labMarkerQueryFromId,
  labPlottedResults,
  labResultStatus,
  labSexFromGender,
  type LabMarker,
  type LabMarkerLabels,
  type LabResultResponse,
} from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { useProfileQuery } from '@/hooks/Settings/useProfile';
import {
  LAB_HISTORY_LIMIT,
  useDeleteLabImports,
  useDeleteLabMarker,
  useDeleteLabResult,
  useLabHistory,
  useLabMarkers,
  useLatestLabResults,
} from '@/hooks/Labs/useLabResults';
import LabImportDialog from './LabImportDialog';
import LabMarkerChart from './LabMarkerChart';
import LabResultDialog from './LabResultDialog';
import { formatLabRange, labResultText } from './labFormat';

const statusVariant = (status: string) =>
  status === 'in_range' ? 'secondary' : 'destructive';

const Labs = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const profile = useProfileQuery(user?.id);
  const sex = labSexFromGender(profile.data?.gender);

  const customMarkers = useLabMarkers();
  const latest = useLatestLabResults();

  // Built-in markers are named from the catalog, never from stored text.
  const labels: LabMarkerLabels = useMemo(
    () =>
      Object.fromEntries(
        LAB_MARKER_PRESETS.map((p) => [
          p.key,
          t(`labs.markers.${p.key}`, p.displayName),
        ])
      ),
    [t]
  );

  const markers = useMemo(
    () =>
      buildLabMarkers(customMarkers.data ?? [], latest.data ?? [], labels, sex),
    [customMarkers.data, latest.data, labels, sex]
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = markers.find((m) => m.id === selectedId) ?? null;

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<LabResultResponse | null>(null);
  const [deleteResult, setDeleteResult] = useState<LabResultResponse | null>(
    null
  );
  const [deleteMarker, setDeleteMarker] = useState(false);
  const [deleteImports, setDeleteImports] = useState(false);

  const history = useLabHistory(
    selected ? labMarkerQueryFromId(selected.id) : null,
    selected?.id ?? ''
  );
  const deleteResultMutation = useDeleteLabResult();
  const deleteMarkerMutation = useDeleteLabMarker();
  const deleteImportsMutation = useDeleteLabImports();

  const results = history.data ?? [];
  const plotted = selected
    ? labPlottedResults(results, selected.unit, selected.ref_range_unit)
    : [];
  const points = selected
    ? labHistoryPoints(results, selected.unit, selected.ref_range_unit)
    : [];
  const notPlotted =
    results.filter((r) => r.value_numeric !== null).length - plotted.length;
  const range = selected
    ? effectiveLabRange(plotted[plotted.length - 1] ?? null, {
        ref_range_low: selected.ref_range_low,
        ref_range_high: selected.ref_range_high,
        ref_range_unit: selected.ref_range_unit,
        markerKey: selected.markerKey,
      })
    : { low: null, high: null };

  const statusLabel = (result: LabResultResponse, marker: LabMarker) => {
    const status = labResultStatus(result, {
      ref_range_low: marker.ref_range_low,
      ref_range_high: marker.ref_range_high,
      ref_range_unit: marker.ref_range_unit,
      markerKey: marker.markerKey,
    });
    if (status === 'unknown') return null;
    const text =
      status === 'low'
        ? t('labs.status.low', 'Low')
        : status === 'high'
          ? t('labs.status.high', 'High')
          : t('labs.status.inRange', 'In range');
    return <Badge variant={statusVariant(status)}>{text}</Badge>;
  };

  const loading = customMarkers.isLoading || latest.isLoading;
  // Built from empty data, a failed load would look like no results at all.
  const loadFailed = customMarkers.isError || latest.isError;

  return (
    <div className="container mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">
          {t('nav.labs', 'Lab results')}
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileUp className="mr-2 h-4 w-4" />
            {t('labs.import.cta', 'Import from a report')}
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('labs.add', 'Add lab result')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('labs.moreActions', 'More actions')}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setDeleteImports(true)}>
                {t('labs.import.deleteTitle', 'Delete imported results')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : loadFailed ? (
        <Card>
          <CardContent
            role="alert"
            className="py-10 text-center text-destructive"
          >
            {t('labs.loadFailed', 'Could not load your lab results.')}
          </CardContent>
        </Card>
      ) : markers.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t(
              'labs.empty',
              'No lab results yet. Add a result like HbA1c, LDL or vitamin D and track it over time.'
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Card>
            <CardContent className="p-0">
              <ul
                className="divide-y"
                aria-label={t('nav.labs', 'Lab results')}
              >
                {markers.map((marker) => (
                  <li key={marker.id}>
                    <button
                      type="button"
                      aria-pressed={marker.id === selectedId}
                      onClick={() => setSelectedId(marker.id)}
                      className={`flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-accent ${
                        marker.id === selectedId ? 'bg-accent' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {marker.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {marker.latest
                            ? marker.latest.entry_date
                            : t('labs.noResults', 'No results')}
                        </div>
                      </div>
                      {marker.latest && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm">
                            {labResultText(marker.latest)}
                          </span>
                          {statusLabel(marker.latest, marker)}
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {selected && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-lg">{selected.name}</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setAddOpen(true)}>
                    <Plus className="mr-1 h-4 w-4" />
                    {t('labs.add', 'Add lab result')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t(
                      'labs.deleteMarker',
                      'Delete marker and all results'
                    )}
                    onClick={() => setDeleteMarker(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {formatLabRange(range.low, range.high, selected.unit) && (
                  <p className="text-sm text-muted-foreground">
                    {t('labs.referenceRange', 'Reference range: {{range}}', {
                      range: formatLabRange(
                        range.low,
                        range.high,
                        selected.unit
                      ),
                    })}
                  </p>
                )}
                {history.isLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : history.isError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {t('labs.loadFailed', 'Could not load your lab results.')}
                  </p>
                ) : (
                  <LabMarkerChart
                    points={points}
                    unit={selected.unit}
                    low={range.low}
                    high={range.high}
                  />
                )}
                {!history.isError && (
                  <>
                    {notPlotted > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {t('labs.chartOtherUnits', {
                          count: notPlotted,
                          defaultValue_one:
                            '{{count}} result in another unit is not plotted.',
                          defaultValue_other:
                            '{{count}} results in other units are not plotted.',
                        })}
                      </p>
                    )}
                    <ul className="divide-y rounded-md border">
                      {[...results]
                        .sort((a, b) =>
                          b.entry_date.localeCompare(a.entry_date)
                        )
                        .map((result) => (
                          <li
                            key={result.id}
                            className="flex items-center justify-between gap-2 p-3"
                          >
                            <div>
                              <div className="text-sm font-medium">
                                {labResultText(result)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {result.entry_date}
                                {result.lab_name ? ` · ${result.lab_name}` : ''}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {statusLabel(result, selected)}
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={t('common.edit', 'Edit')}
                                onClick={() => setEditing(result)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={t(
                                  'labs.deleteTitle',
                                  'Delete result'
                                )}
                                onClick={() => setDeleteResult(result)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </li>
                        ))}
                    </ul>
                    {results.length >= LAB_HISTORY_LIMIT && (
                      <p className="text-xs text-muted-foreground">
                        {t(
                          'labs.historyCutOff',
                          'History shows at most the newest {{count}} results.',
                          { count: LAB_HISTORY_LIMIT }
                        )}
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {(addOpen || editing) && (
        <LabResultDialog
          key={editing?.id ?? selected?.id ?? 'new'}
          open
          onOpenChange={(open) => {
            if (!open) {
              setAddOpen(false);
              setEditing(null);
            }
          }}
          markers={markers}
          labels={labels}
          sex={sex}
          marker={addOpen ? selected : null}
          result={editing}
        />
      )}

      {importOpen && (
        <LabImportDialog
          open
          onOpenChange={setImportOpen}
          markers={markers}
          labels={labels}
          sex={sex}
        />
      )}

      <ConfirmationDialog
        open={deleteResult !== null}
        onOpenChange={(open) => !open && setDeleteResult(null)}
        title={t('labs.deleteTitle', 'Delete result')}
        description={t('labs.deleteMessage', 'Delete this lab result?')}
        variant="destructive"
        confirmLabel={t('common.delete', 'Delete')}
        onConfirm={() => {
          if (deleteResult) deleteResultMutation.mutate(deleteResult.id);
          setDeleteResult(null);
        }}
      />
      <ConfirmationDialog
        open={deleteMarker}
        onOpenChange={setDeleteMarker}
        title={t('labs.deleteMarkerTitle', 'Delete marker')}
        description={t(
          'labs.deleteMarkerMessage',
          'Delete {{name}} and all of its results? This cannot be undone.',
          { name: selected?.name ?? '' }
        )}
        variant="destructive"
        confirmLabel={t('common.delete', 'Delete')}
        onConfirm={() => {
          if (selected) {
            deleteMarkerMutation.mutate(
              selected.markerKey
                ? { markerKey: selected.markerKey }
                : { markerId: selected.markerId as string },
              { onSuccess: () => setSelectedId(null) }
            );
          }
          setDeleteMarker(false);
        }}
      />
      <ConfirmationDialog
        open={deleteImports}
        onOpenChange={setDeleteImports}
        title={t('labs.import.deleteTitle', 'Delete imported results')}
        description={t(
          'labs.import.deleteMessage',
          'Delete every result that was imported from a report, and any marker of your own left empty? Results you entered yourself are kept.'
        )}
        variant="destructive"
        confirmLabel={t('common.delete', 'Delete')}
        onConfirm={() => {
          deleteImportsMutation.mutate(undefined, {
            onSuccess: (deleted) => {
              toast({
                title: t('labs.import.deleted', {
                  count: deleted.results,
                  defaultValue_one: 'Deleted {{count}} imported result',
                  defaultValue_other: 'Deleted {{count}} imported results',
                }),
              });
              setSelectedId(null);
            },
          });
          setDeleteImports(false);
        }}
      />
    </div>
  );
};

export default Labs;
