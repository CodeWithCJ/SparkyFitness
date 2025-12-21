import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import * as fastingService from '../services/fastingService';
import { FastingLog } from '../services/fastingService';
import { useAuth } from '../hooks/useAuth'; // Restored import path
// queryClient import removed

interface FastingContextType {
    activeFast: FastingLog | null;
    isLoading: boolean;
    refreshFast: () => Promise<void>;
    startFast: (startTime: Date, targetEndTime: Date, fastingType: string) => Promise<void>;
    endFast: (weight?: number, mood?: { value: number; notes: string }) => Promise<void>;
}

const FastingContext = createContext<FastingContextType | undefined>(undefined);

export const FastingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [activeFast, setActiveFast] = useState<FastingLog | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
    const { user } = useAuth(); // Authenticated if user is not null
    const isAuthenticated = !!user;

    const refreshFast = useCallback(async () => {
        console.log(`[FastingContext] refreshFast called. IsAuthenticated: ${isAuthenticated}`);
        if (!isAuthenticated) {
            console.log("[FastingContext] Not authenticated, skipping refresh.");
            return;
        }
        try {
            console.log("[FastingContext] Fetching active fast...");
            const fast = await fastingService.getCurrentFast();
            console.log(`[FastingContext] Active fast fetched:`, fast);
            setActiveFast(fast);
        } catch (error) {
            console.error("[FastingContext] Failed to fetch active fast", error);
        } finally {
            setIsLoading(false);
        }
    }, [isAuthenticated]);

    useEffect(() => {
        console.log("[FastingContext] useEffect triggered due to refreshFast change.");
        refreshFast();
    }, [refreshFast]);

    const startFast = async (startTime: Date, targetEndTime: Date, fastingType: string) => {
        try {
            const newFast = await fastingService.startFast(startTime, targetEndTime, fastingType);
            setActiveFast(newFast);
        } catch (error: any) {
            // If fast already exists (400), refresh the state to get it
            if (error.response?.status === 400 && error.response?.data?.error?.includes('already an active fast')) {
                console.log("Active fast exists, refreshing state...");
                await refreshFast();
            } else {
                throw error;
            }
        }
    };

    const endFast = async (weight?: number, mood?: { value: number; notes: string }) => {
        if (!activeFast) return;
        const endTime = new Date();
        await fastingService.endFast(activeFast.id, new Date(activeFast.start_time), endTime, weight, mood);
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
