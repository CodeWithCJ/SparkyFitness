import React, { useEffect, useState } from 'react';
// CircularProgress import removed
import { cn } from '@/lib/utils';
import { Flame } from 'lucide-react';

interface FastingTimerRingProps {
    startTime: Date;
    targetEndTime: Date;
    size?: number;
    showZone?: boolean;
}

const FastingTimerRing: React.FC<FastingTimerRingProps> = ({ startTime, targetEndTime, size = 200, showZone = true }) => {
    const [elapsed, setElapsed] = useState(0);
    const [progress, setProgress] = useState(0);

    const totalDuration = targetEndTime.getTime() - startTime.getTime();

    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date();
            const diff = now.getTime() - startTime.getTime();
            setElapsed(diff);
            setProgress(Math.min(100, Math.max(0, (diff / totalDuration) * 100)));
        }, 1000);
        return () => clearInterval(interval);
    }, [startTime, totalDuration]);

    const formatTime = (ms: number) => {
        const seconds = Math.floor((ms / 1000) % 60);
        const minutes = Math.floor((ms / (1000 * 60)) % 60);
        const hours = Math.floor(ms / (1000 * 60 * 60));
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    const getZone = (ms: number) => {
        const hours = ms / (1000 * 60 * 60);
        if (hours < 4) return { name: 'Anabolic', color: 'text-blue-500' };
        if (hours < 16) return { name: 'Catabolic', color: 'text-orange-500' };
        if (hours < 24) return { name: 'Fat Burning', color: 'text-red-500', icon: <Flame className="w-4 h-4 text-red-500 inline" /> };
        return { name: 'Ketosis', color: 'text-purple-500', icon: <Flame className="w-4 h-4 text-purple-500 inline" /> };
    };

    const zone = getZone(elapsed);

    return (
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
            {/* Simple SVG Ring if CircularProgress is not available or custom needed */}
            <svg className="absolute w-full h-full transform -rotate-90">
                <circle
                    className="text-gray-200"
                    strokeWidth="8"
                    stroke="currentColor"
                    fill="transparent"
                    r={size / 2 - 10}
                    cx={size / 2}
                    cy={size / 2}
                />
                <circle
                    className="text-primary transition-all duration-1000 ease-linear"
                    strokeWidth="8"
                    strokeDasharray={2 * Math.PI * (size / 2 - 10)}
                    strokeDashoffset={2 * Math.PI * (size / 2 - 10) * (1 - progress / 100)}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r={size / 2 - 10}
                    cx={size / 2}
                    cy={size / 2}
                />
            </svg>
            <div className="relative z-10 flex flex-col items-center">
                <div className="text-3xl font-bold font-mono">{formatTime(elapsed)}</div>
                {showZone && (
                    <div className={cn("text-sm font-medium mt-1 flex items-center gap-1", zone.color)}>
                        {zone.icon} {zone.name}
                    </div>
                )}
                <div className="text-xs text-muted-foreground mt-1">
                    {progress >= 100 ? "Goal Reached!" : `${Math.round(progress)}%`}
                </div>
            </div>
        </div>
    );
};

export default FastingTimerRing;
