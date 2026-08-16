/**
 * Vendored from react-native-ui-datepicker
 * License: MIT
 */

import React from 'react';
import { StyleProp, TextStyle, Animated, ViewStyle, Text } from 'react-native';
import styles from './wheel-picker.style';
import { PickerOption } from './types';

interface ItemProps {
  textStyle: StyleProp<TextStyle>;
  textClassName: string;
  style: StyleProp<ViewStyle>;
  option: PickerOption | null;
  height: number;
  index: number;
  currentScrollIndex: Animated.AnimatedAddition<number>;
  visibleRest: number;
  rotationFunction: (x: number) => number;
  opacityFunction: (x: number) => number;
  scaleFunction: (x: number) => number;
}

const WheelPickerItem: React.FC<ItemProps> = ({
  textStyle,
  textClassName,
  style,
  height,
  option,
  index,
  visibleRest,
  currentScrollIndex,
  opacityFunction,
  rotationFunction,
  scaleFunction,
}) => {
  const relativeScrollIndex = Animated.subtract(index, currentScrollIndex);

  const translateY = relativeScrollIndex.interpolate({
    inputRange: (() => {
      const range = [0];
      for (let i = 1; i <= visibleRest + 1; i++) {
        range.unshift(-i);
        range.push(i);
      }
      return range;
    })(),
    outputRange: (() => {
      const range = [0];
      for (let i = 1; i <= visibleRest + 1; i++) {
        let y =
          (height / 2) * (1 - Math.sin(Math.PI / 2 - rotationFunction(i)));
        for (let j = 1; j < i; j++) {
          y += height * (1 - Math.sin(Math.PI / 2 - rotationFunction(j)));
        }
        range.unshift(y);
        range.push(-y);
      }
      return range;
    })(),
  });

  const opacity = relativeScrollIndex.interpolate({
    inputRange: (() => {
      const range = [0];
      for (let i = 1; i <= visibleRest + 1; i++) {
        range.unshift(-i);
        range.push(i);
      }
      return range;
    })(),
    outputRange: (() => {
      const range = [1];
      for (let x = 1; x <= visibleRest + 1; x++) {
        const y = opacityFunction(x);
        range.unshift(y);
        range.push(y);
      }
      return range;
    })(),
  });

  const scale = relativeScrollIndex.interpolate({
    inputRange: (() => {
      const range = [0];
      for (let i = 1; i <= visibleRest + 1; i++) {
        range.unshift(-i);
        range.push(i);
      }
      return range;
    })(),
    outputRange: (() => {
      const range = [1.0];
      for (let x = 1; x <= visibleRest + 1; x++) {
        const y = scaleFunction(x);
        range.unshift(y);
        range.push(y);
      }
      return range;
    })(),
  });

  const rotateX = relativeScrollIndex.interpolate({
    inputRange: (() => {
      const range = [0];
      for (let i = 1; i <= visibleRest + 1; i++) {
        range.unshift(-i);
        range.push(i);
      }
      return range;
    })(),
    outputRange: (() => {
      const range = ['0deg'];
      for (let x = 1; x <= visibleRest + 1; x++) {
        const y = rotationFunction(x);
        range.unshift(`${y}deg`);
        range.push(`${y}deg`);
      }
      return range;
    })(),
  });

  return (
    <Animated.View
      style={[
        styles.option,
        style,
        {
          height,
          opacity,
          transform: [{ translateY }, { rotateX }, { scale }],
        },
      ]}
    >
      <Text style={textStyle} className={textClassName}>
        {option?.text}
      </Text>
    </Animated.View>
  );
};

const customComparator = (
  prevProps: Readonly<ItemProps>,
  nextProps: Readonly<ItemProps>
) => {
  return (
    prevProps.textClassName === nextProps.textClassName &&
    JSON.stringify(prevProps.textStyle) === JSON.stringify(nextProps.textStyle)
  );
};

export default React.memo(WheelPickerItem, customComparator);
