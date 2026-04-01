import React from 'react';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import type { ViewProps } from 'react-native';
import type { AnimatedProps } from 'react-native-reanimated';

type FadeViewProps = AnimatedProps<ViewProps> & {
  children: React.ReactNode;
};

const entering = FadeIn.duration(200);
const exiting = FadeOut.duration(150);

const FadeView: React.FC<FadeViewProps> = ({ children, ...props }) => (
  <Animated.View entering={entering} exiting={exiting} {...props}>
    {children}
  </Animated.View>
);

export default FadeView;
