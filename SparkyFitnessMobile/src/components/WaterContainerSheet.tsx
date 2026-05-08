import React, { useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { Platform, View, Text, Pressable } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { FullWindowOverlay } from 'react-native-screens';
import { useCSSVariable } from 'uniwind';
import type { WaterContainer } from '../types/measurements';
import { WATER_UNIT_LABELS, getServingVolume } from '../utils/unitConversions';
import Icon from './Icon';

const sheetContainer =
  Platform.OS === 'ios'
    ? ({ children }: React.PropsWithChildren) => <FullWindowOverlay>{children}</FullWindowOverlay>
    : undefined;

export interface WaterContainerSheetRef {
  present: () => void;
  dismiss: () => void;
}

interface WaterContainerSheetProps {
  containers: WaterContainer[];
  activeContainerId?: number;
  onSelect: (id: number) => void;
}

const WaterContainerSheet = React.forwardRef<WaterContainerSheetRef, WaterContainerSheetProps>(
  ({ containers, activeContainerId, onSelect }, ref) => {
    const bottomSheetRef = useRef<BottomSheetModal>(null);

    const [surfaceBg, textMuted, textPrimary, textSecondary, accentPrimary] = useCSSVariable([
      '--color-surface',
      '--color-text-muted',
      '--color-text-primary',
      '--color-text-secondary',
      '--color-accent-primary',
    ]) as [string, string, string, string, string];

    useImperativeHandle(ref, () => ({
      present: () => bottomSheetRef.current?.present(),
      dismiss: () => bottomSheetRef.current?.dismiss(),
    }));

    useEffect(() => {
      const sheetRef = bottomSheetRef.current;
      return () => {
        sheetRef?.dismiss();
      };
    }, []);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          opacity={0.5}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
        />
      ),
      []
    );

    const handleSelect = (id: number) => {
      onSelect(id);
      bottomSheetRef.current?.dismiss();
    };

    return (
      <BottomSheetModal
        ref={bottomSheetRef}
        enableDynamicSizing
        backdropComponent={renderBackdrop}
        containerComponent={sheetContainer}
        backgroundStyle={{ backgroundColor: surfaceBg }}
        handleIndicatorStyle={{ backgroundColor: textMuted }}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          <Text style={{ color: textPrimary, fontSize: 17, fontWeight: '600', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
            Select Container
          </Text>
          {containers.map((c) => {
            const isActive = c.id === activeContainerId;
            const unitLabel = WATER_UNIT_LABELS[c.unit] ?? c.unit;
            const serving = getServingVolume(c).toLocaleString(undefined, { maximumFractionDigits: 1 });
            return (
              <Pressable
                key={c.id}
                onPress={() => handleSelect(c.id)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: textPrimary, fontSize: 15, fontWeight: isActive ? '600' : '400' }}>
                    {c.name}
                  </Text>
                  <Text style={{ color: textSecondary, fontSize: 13, marginTop: 2 }}>
                    {serving} {unitLabel} per serving
                  </Text>
                </View>
                {isActive && (
                  <Icon name="checkmark" size={20} color={accentPrimary} />
                )}
              </Pressable>
            );
          })}
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  }
);

WaterContainerSheet.displayName = 'WaterContainerSheet';

export default WaterContainerSheet;
