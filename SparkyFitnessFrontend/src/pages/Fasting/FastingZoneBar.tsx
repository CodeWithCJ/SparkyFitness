import React from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface FastingZoneBarProps {
    hoursFasted: number;
}

const ZONES = [
    { name: 'Anabolic', start: 0, end: 4, color: 'bg-blue-500', desc: 'Rising blood sugar.' },
    { name: 'Catabolic', start: 4, end: 16, color: 'bg-orange-500', desc: 'Blood sugar falls.' },
    { name: 'Fat Burning', start: 16, end: 24, color: 'bg-red-500', desc: 'Ramping up fat burn.' },
    { name: 'Ketosis', start: 24, end: 72, color: 'bg-purple-500', desc: 'Running on ketones.' },
    { name: 'Deep Ketosis', start: 72, end: 1000, color: 'bg-indigo-500', desc: 'Autophagy peaks.' },
];

const FastingZoneBar: React.FC<FastingZoneBarProps> = ({ hoursFasted }) => {
    // Determine current zone index
    const currentZoneIndex = ZONES.findIndex(z => hoursFasted < z.end);
    const activeIndex = currentZoneIndex === -1 ? ZONES.length - 1 : currentZoneIndex;

    return (
        <div className="w-full space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground uppercase tracking-wider mb-1">
                <span>Metabolic State</span>
                {/* <span>{ZONES[activeIndex].name}</span> */}
            </div>
            <div className="w-full h-4 bg-secondary rounded-full overflow-hidden flex">
                {ZONES.map((zone, index) => {
                    const isPassed = index < activeIndex;
                    const isActive = index === activeIndex;
                    const isFuture = index > activeIndex;

                    let width = '0%';
                    // Simplified visual width distribution for demo
                    // In reality, 0-4 is small compared to 24-72, but we want equal visual steps or proportional?
                    // Let's use equal width for readability of stages.
                    width = `${100 / ZONES.length}%`;

                    // Calculate opacity: Passed = 100%, Active = Pulse?, Future = 30%
                    let opacity = isPassed ? 'opacity-100' : (isActive ? 'opacity-100 animate-pulse' : 'opacity-20');
                    if (isActive) opacity = 'opacity-100 ring-2 ring-white ring-inset';

                    return (
                        <TooltipProvider key={zone.name}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div
                                        className={cn("h-full transition-all duration-500 cursor-help", zone.color, opacity)}
                                        style={{ width }}
                                    />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <div className="font-bold">{zone.name}</div>
                                    <div className="text-xs">{zone.start}-{zone.end} hours</div>
                                    <div className="text-xs text-muted-foreground">{zone.desc}</div>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    );
                })}
            </div>
            <div className="flex justify-between text-xs font-medium mt-1">
                <span>0h</span>
                <span>16h</span>
                <span>24h</span>
                <span>72h+</span>
            </div>
        </div>
    );
};

export default FastingZoneBar;
