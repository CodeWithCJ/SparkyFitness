/**
 * Vendored from react-native-ui-datepicker
 * Original source: https://github.com/farhoudshapouran/react-native-ui-datepicker
 * License: MIT
 * 
 * iOS bug fix: Track user-scroll state to avoid over-scrolling animation when
 * wrapping values (e.g., 59->00 in seconds). When a user scroll triggers onChange,
 * we skip the animated scrollToIndex since the FlatList is already positioned correctly.
 */

import React, { useEffect, useMemo, useRef, useState, memo } from 'react';
import {
  StyleProp,
  TextStyle,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Animated,
  ViewStyle,
  View,
  ViewProps,
  FlatListProps,
  FlatList,
  Platform,
} from 'react-native';
import styles from './wheel-picker.style';
import WheelPickerItem from './wheel-picker-item';
import { PickerOption } from './types';

interface Props {
  value: number | string;
  options: PickerOption[];
  onChange: (index: number | string) => void;
  selectedIndicatorStyle?: StyleProp<ViewStyle>;
  itemTextStyle?: TextStyle;
  itemTextClassName?: string;
  itemStyle?: ViewStyle;
  selectedIndicatorClassName?: string;
  itemHeight?: number;
  containerStyle?: ViewStyle;
  containerProps?: Omit<ViewProps, 'style'>;
  scaleFunction?: (x: number) => number;
  rotationFunction?: (x: number) => number;
  opacityFunction?: (x: number) => number;
  visibleRest?: number;
  decelerationRate?: 'normal' | 'fast' | number;
  flatListProps?: Omit<FlatListProps<PickerOption | null>, 'data' | 'renderItem'>;
}

const WheelPicker: React.FC<Props> = ({
  value,
  options,
  onChange,
  selectedIndicatorStyle = {},
  containerStyle = {},
  itemStyle = {},
  itemTextStyle = {},
  selectedIndicatorClassName = '',
  itemTextClassName = '',
  itemHeight = 40,
  scaleFunction = (x: number) => 1.0 ** x,
  rotationFunction = (x: number) => 1 - Math.pow(1 / 2, x),
  opacityFunction = (x: number) => Math.pow(1 / 3, x),
  visibleRest = 2,
  decelerationRate = 'normal',
  containerProps = {},
  flatListProps = {},
}) => {
  const momentumStarted = useRef(false);
  // Track if we just handled a user scroll to avoid over-scrolling animation
  const handledUserScroll = useRef(false);
  const lastEmittedValueRef = useRef<number | string>(value);
  
  const selectedIndex = options.findIndex((item) => item.value === value);

  const flatListRef = useRef<FlatList>(null);
  const [scrollY] = useState(new Animated.Value(selectedIndex * itemHeight));

  const containerHeight = (1 + visibleRest * 2) * itemHeight;
  const paddedOptions = useMemo(() => {
    const array: (PickerOption | null)[] = [...options];
    for (let i = 0; i < visibleRest; i++) {
      array.unshift(null);
      array.push(null);
    }
    return array;
  }, [options, visibleRest]);

  const offsets = useMemo(
    () => [...Array(paddedOptions.length)].map((_, i) => i * itemHeight),
    [paddedOptions, itemHeight]
  );

  const currentScrollIndex = useMemo(
    () => Animated.add(Animated.divide(scrollY, itemHeight), visibleRest),
    [visibleRest, scrollY, itemHeight]
  );

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = Math.min(
      itemHeight * (options.length - 1),
      Math.max(event.nativeEvent.contentOffset.y, 0)
    );

    let index = Math.floor(offsetY / itemHeight);
    const remainder = offsetY % itemHeight;
    if (remainder > itemHeight / 2) {
      index++;
    }

    const nextValue = options[index]?.value || 0;
    if (index !== selectedIndex && nextValue !== lastEmittedValueRef.current) {
      lastEmittedValueRef.current = nextValue;
      handledUserScroll.current = true;
      onChange(nextValue);
    }
  };

  const handleMomentumScrollBegin = () => {
    momentumStarted.current = true;
  };

  const handleMomentumScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>
  ) => {
    momentumStarted.current = false;
    handleScrollEnd(event);
  };

  const scrollEndDragTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScrollEndDrag = (
    event: NativeSyntheticEvent<NativeScrollEvent>
  ) => {
    // Capture the offset value immediately
    const offsetY = event.nativeEvent.contentOffset?.y;

    if (scrollEndDragTimeoutRef.current != null) {
      clearTimeout(scrollEndDragTimeoutRef.current);
    }

    // We'll start a short timer to see if momentum scroll begins
    scrollEndDragTimeoutRef.current = setTimeout(() => {
      scrollEndDragTimeoutRef.current = null;
      // If momentum scroll hasn't started within the timeout,
      // then it was a slow scroll that won't trigger momentum
      if (!momentumStarted.current && offsetY !== undefined) {
        // Create a synthetic event with just the data we need
        const syntheticEvent = {
          nativeEvent: {
            contentOffset: { y: offsetY },
          },
        };
        handleScrollEnd(syntheticEvent as any);
      }
    }, 50);
  };

  // Stale-timer guard: without this a pending timeout from a drag can fire
  // handleScrollEnd/onChange after this WheelPicker instance has unmounted
  // (e.g. DurationWheel remounts on a `key` change when switching tabs).
  useEffect(() => {
    return () => {
      if (scrollEndDragTimeoutRef.current != null) {
        clearTimeout(scrollEndDragTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (selectedIndex < 0 || selectedIndex >= options.length) {
      throw new Error(
        `Selected index ${selectedIndex} is out of bounds [0, ${
          options.length - 1
        }]`
      );
    }
  }, [selectedIndex, options]);

  useEffect(() => {
    // Keep the dedupe ref aligned with controlled updates from outside.
    lastEmittedValueRef.current = value;
  }, [value]);

  /**
   * If selectedIndex is changed from outside (not via onChange) we need to scroll to the specified index.
   * This ensures that what the user sees as selected in the picker always corresponds to the value state.
   *
   * User-scroll fix: when onChange came from this picker's own scroll gesture, the FlatList is already
   * on the correct row. Forcing scrollToIndex can cause rollover artifacts (iOS overscroll, Android flash),
   * especially when parent state canonicalizes values (e.g., looped seconds wheel).
   */
  useEffect(() => {
    if (handledUserScroll.current) {
      handledUserScroll.current = false;
      return;
    }

    const shouldAnimate = Platform.OS === 'ios';
    flatListRef.current?.scrollToIndex({
      index: selectedIndex,
      animated: shouldAnimate,
    });
  }, [selectedIndex, itemHeight]);

  return (
    <View
      style={[styles.container, { height: containerHeight }, containerStyle]}
      {...containerProps}
    >
      <View
        style={[
          styles.selectedIndicator,
          selectedIndicatorStyle,
          {
            transform: [{ translateY: -itemHeight / 2 }],
            height: itemHeight,
          },
        ]}
        className={selectedIndicatorClassName}
      />
      <Animated.FlatList
        {...flatListProps}
        ref={flatListRef}
        nestedScrollEnabled
        removeClippedSubviews
        windowSize={7}
        initialNumToRender={Math.max(8, visibleRest * 4)}
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={16}
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollBegin={handleMomentumScrollBegin}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        snapToOffsets={offsets}
        decelerationRate={decelerationRate}
        initialScrollIndex={selectedIndex}
        getItemLayout={(_, index) => ({
          length: itemHeight,
          offset: itemHeight * index,
          index,
        })}
        data={paddedOptions}
        keyExtractor={(item, index) =>
          item ? `${item.value}-${item.text}-${index}` : `null-${index}`
        }
        renderItem={({ item: option, index }) => (
          <WheelPickerItem
            key={`option-${index}`}
            index={index}
            option={option}
            style={itemStyle}
            textStyle={itemTextStyle}
            textClassName={itemTextClassName}
            height={itemHeight}
            currentScrollIndex={currentScrollIndex}
            scaleFunction={scaleFunction}
            rotationFunction={rotationFunction}
            opacityFunction={opacityFunction}
            visibleRest={visibleRest}
          />
        )}
      />
    </View>
  );
};

export default memo(WheelPicker);
