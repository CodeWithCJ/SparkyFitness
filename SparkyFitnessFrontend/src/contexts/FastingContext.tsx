import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import * as fastingService from '../services/fastingService';
import { FastingLog } from '../services/fastingService';
import { useAuth } from '../hooks/useAuth'; // Restored import path
import { debug, error } from '@/utils/logging'; // Import logging utility
import { getUserLoggingLevel } from '@/utils/userPreferences'; // Import user logging level
// queryClient import removed

interface FastingContextType {
    activeFast: FastingLog | null;
    isLoading: boolean;
    refreshFast: () => Promise<void>;
    startFast: (startTime: Date, targetEndTime: Date, fastingType: string) => Promise<void>;
    endFast: (weight?: number, mood?: { value: number; notes: string }, startTime?: Date, endTime?: Date) => Promise<void>;
}

const FastingContext = createContext<FastingContextType | undefined>(undefined);

export const FastingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [activeFast, setActiveFast] = useState<FastingLog | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
    const { user, loading: authLoading } = useAuth(); // Authenticated if user is not null
    const isAuthenticated = !!user;
    const loggingLevel = getUserLoggingLevel();

    const refreshFast = useCallback(async () => {
        debug(loggingLevel, `[FastingContext] refreshFast called. IsAuthenticated: ${isAuthenticated}`);
        // Ensure loading flag is accurate for callers
        setIsLoading(true);
        if (!isAuthenticated) {
            debug(loggingLevel, "[FastingContext] Not authenticated, skipping refresh.");
            setActiveFast(null);
            setIsLoading(false);
            return;
        }

        try {
            debug(loggingLevel, "[FastingContext] Fetching active fast...");
            const fast = await fastingService.getCurrentFast();
            debug(loggingLevel, `[FastingContext] Active fast fetched:`, fast);
            setActiveFast(fast);
        } catch (err: any) {
            error(loggingLevel, "[FastingContext] Failed to fetch active fast", err);
            setActiveFast(null);
        } finally {
            setIsLoading(false);
        }
    }, [isAuthenticated, loggingLevel]);

    useEffect(() => {
        debug(loggingLevel, "[FastingContext] useEffect triggered due to refreshFast change.");
        // Wait until auth check completes to decide whether to refresh fasting state
        if (authLoading) {
            debug(loggingLevel, "[FastingContext] Auth still loading, delaying refresh.");
            return;
        }
        if (!isAuthenticated) {
            debug(loggingLevel, "[FastingContext] No authenticated user, skipping refresh.");
            // Ensure loading flag is cleared for consumers
            setActiveFast(null);
            setIsLoading(false);
            return;
        }
        refreshFast();
    }, [refreshFast, authLoading, isAuthenticated, loggingLevel]);

    const startFast = async (startTime: Date, targetEndTime: Date, fastingType: string) => {
        try {
            const newFast = await fastingService.startFast(startTime, targetEndTime, fastingType);
            setActiveFast(newFast);
        } catch (err: any) {
            // If fast already exists (400), refresh the state to get it
            if (err.response?.status === 400 && err.response?.data?.error?.includes('already an active fast')) {
                debug(loggingLevel, "Active fast exists, refreshing state...");
                await refreshFast();
            } else {
                throw err;
            }
        }
    };

    const endFast = async (weight?: number, mood?: { value: number; notes: string }, startTime?: Date, endTime?: Date) => {
        if (!activeFast) return;
        const start = startTime ?? new Date(activeFast.start_time);
        const end = endTime ?? new Date();
        await fastingService.endFast(activeFast.id, start, end, weight, mood);
        setActiveFast(null);
    };

    return (
        <FastingContext.Provider value={{ activeFast, isLoading, refreshFast, startFast, endFast }}>
            {children}
        </FastingContext.Provider>
    );
};

export const useFasting = () => {
    const context = useContext(FastingContext);
    if (context === undefined) {
        throw new Error('useFasting must be used within a FastingProvider');
    }
    return context;
};
