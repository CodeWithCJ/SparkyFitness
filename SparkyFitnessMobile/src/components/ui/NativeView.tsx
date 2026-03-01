import { createElement } from "react";
import { ViewProps } from "react-native";

const NativeView: React.FC<ViewProps> = (props) => createElement('RCTView', props);

export default NativeView;