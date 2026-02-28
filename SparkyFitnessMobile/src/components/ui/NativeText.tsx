import { createElement } from "react";
import { TextProps } from "react-native";

const NativeText: React.FC<TextProps> = (props) => createElement('RCTText', props);

export default NativeText;
