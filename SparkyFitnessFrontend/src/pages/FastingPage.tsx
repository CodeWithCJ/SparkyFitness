import React, { useEffect, useState } from 'react';
import { useFasting } from '@/contexts/FastingContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FastingTimerRing from '@/components/fasting/FastingTimerRing';
import FastingZoneBar from '@/components/fasting/FastingZoneBar';
import EndFastDialog from '@/components/fasting/EndFastDialog';
import { format, addHours, differenceInMinutes } from 'date-fns';
import { Play, Square, History, BarChart } from 'lucide-react';
import { getFastingHistory, FastingLog, getFastingStats, FastingStats } from '@/services/fastingService';
import { useTranslation } from 'react-i18next';

import { FASTING_PRESETS } from '@/constants/fastingPresets';

const FastingPage: React.FC = () => {
    const { t } = useTranslation();
    const { activeFast, startFast, endFast, isLoading } = useFasting();
    const [selectedPresetId, setSelectedPresetId] = useState<string>('16-8');
    const [showEndDialog, setShowEndDialog] = useState(false);

    // History & Stats State
    const [history, setHistory] = useState<FastingLog[]>([]);
    const [stats, setStats] = useState<FastingStats | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [hist, st] = await Promise.all([
                getFastingHistory(10), // Get last 10
                getFastingStats()
            ]);
            setHistory(hist);
            setStats(st);
        } catch (e) {
            console.error("Error loading fasting data", e);
        }
    };

    const handleStart = async () => {
        const preset = FASTING_PRESETS.find(p => p.id === selectedPresetId);
        if (!preset) return;

        const start = new Date();
        const end = addHours(start, preset.fastingHours);

        await startFast(start, end, preset.name);
    };

    if (isLoading) return <div>Loading...</div>;

    const fastDurationHours = activeFast
        ? (new Date().getTime() - new Date(activeFast.start_time).getTime()) / (1000 * 60 * 60)
        : 0;

    // Helper to format duration for dialog
    const formatDuration = () => {
        if (!activeFast) return "";
        const mins = differenceInMinutes(new Date(), new Date(activeFast.start_time));
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h}h ${m}m`;
    };

    return (
        <div className="container mx-auto p-4 max-w-4xl space-y-6 pb-20">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">Fasting Tracker</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Main Timer Column */}
                <div className="md:col-span-2 space-y-6">
                    <Card className="bg-gradient-to-br from-card to-secondary/10 border-primary/20 shadow-lg">
                        <CardHeader>
                            <CardTitle>{activeFast ? "Current Fast" : "Start New Fast"}</CardTitle>
                            <CardDescription>
                                {activeFast ? `Started ${format(new Date(activeFast.start_time), 'h:mm a')}` : "Select a protocol to begin"}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center space-y-8">
                            {activeFast ? (
                                <>
                                    <FastingTimerRing
                                        startTime={new Date(activeFast.start_time)}
                                        targetEndTime={new Date(activeFast.target_end_time!)}
                                        size={280}
                                    />

                                    <div className="w-full max-w-md">
                                        <FastingZoneBar hoursFasted={fastDurationHours} />
                                    </div>

                                    <div className="flex gap-4 w-full">
                                        <Button
                                            variant="destructive"
                                            size="lg"
                                            className="w-full shadow-md hover:shadow-lg transition-all"
                                            onClick={() => setShowEndDialog(true)}
                                        >
                                            <Square className="w-5 h-5 mr-2 fill-current" /> End Fast
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="w-full max-w-xs space-y-4">
                                        <div className="space-y-2">
                                            <Label>Fasting Protocol</Label>
                                            <Select value={selectedPresetId} onValueChange={setSelectedPresetId}>
                                                <SelectTrigger className="h-12 text-lg">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {FASTING_PRESETS.map(p => (
                                                        <SelectItem key={p.id} value={p.id}>
                                                            {p.name} ({p.fastingHours}:{p.eatingHours})
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <p className="text-sm text-muted-foreground text-center mt-2">
                                                {FASTING_PRESETS.find(p => p.id === selectedPresetId)?.description}
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        size="lg"
                                        className="w-full max-w-xs h-14 text-lg shadow-xl shadow-primary/20 hover:shadow-primary/30 transition-all"
                                        onClick={handleStart}
                                    >
                                        <Play className="w-6 h-6 mr-2" /> Start Fasting
                                    </Button>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Stats & History Column */}
                <div className="space-y-6">
                    {/* Stats Card */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <BarChart className="w-5 h-5 text-muted-foreground" /> Overview
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-col">
                                <span className="text-3xl font-bold">{stats?.total_completed_fasts || 0}</span>
                                <span className="text-xs text-muted-foreground uppercase">Total Fasts</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-3xl font-bold">{Math.round((parseFloat(stats?.total_minutes_fasted || '0')) / 60)}</span>
                                <span className="text-xs text-muted-foreground uppercase">Total Hours</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-3xl font-bold">{Math.round(parseFloat(stats?.average_duration_minutes || '0') / 60 * 10) / 10}h</span>
                                <span className="text-xs text-muted-foreground uppercase">Avg Duration</span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* History Card */}
                    <Card className="flex-1">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <History className="w-5 h-5 text-muted-foreground" /> Recent History
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-0">
                            <div className="space-y-0 divide-y">
                                {Array.isArray(history) && history.map(log => (
                                    <div key={log.id} className="p-4 flex justify-between items-center hover:bg-muted/50 transition-colors">
                                        <div>
                                            <div className="font-medium text-sm">{format(new Date(log.start_time), 'MMM d, h:mm a')}</div>
                                            <div className="text-xs text-muted-foreground">{log.fasting_type}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-bold text-primary">{Math.floor((log.duration_minutes || 0) / 60)}h {(log.duration_minutes || 0) % 60}m</div>
                                            {/* Mood Emoji if exists? We didn't join emoji but we have value */}
                                            {/* We can map value to emoji here or update backend to return emoji/label. For now simple. */}
                                            {log.status === 'COMPLETED' && <span className="text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full">Done</span>}
                                        </div>
                                    </div>
                                ))}
                                {history.length === 0 && <div className="p-4 text-center text-sm text-muted-foreground">No history yet</div>}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <EndFastDialog
                isOpen={showEndDialog}
                onClose={() => setShowEndDialog(false)}
                durationFormatted={formatDuration()}
                onEnd={async (weight, mood) => {
                    await endFast(weight, mood);
                    // Refresh history
                    loadData();
                }}
            />
        </div>
    );
};

export default FastingPage;
