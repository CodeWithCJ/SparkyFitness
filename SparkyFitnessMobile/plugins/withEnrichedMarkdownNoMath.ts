import {
  ConfigPlugin,
  withGradleProperties,
  withDangerousMod,
} from 'expo/config-plugins';
import fs from 'fs';
import path from 'path';

/**
 * Excludes react-native-enriched-markdown's optional LaTeX math native
 * dependencies (Android `AndroidMath`, iOS `iosMath`) from the build.
 *
 * We render chat markdown with `md4cFlags.latexMath` disabled, so the math
 * backends are dead weight — and the library's Android build warns they can
 * cause `libc++_shared.so` / `mergeDebugAndroidTestJavaResource` conflicts.
 *
 * The library ships its own `enableMath: false` config plugin, but its
 * `@expo/config-plugins` default import fails interop under config-plugins v55
 * (`withDangerousMod` resolves undefined), so we replicate its two levers here:
 *   - Android: the `enrichedMarkdown.enableMath` gradle property (default true).
 *   - iOS: `ENV['ENRICHED_MARKDOWN_ENABLE_MATH'] = '0'`, read by the podspec.
 */
const IOS_MATH_OPT_OUT = "ENV['ENRICHED_MARKDOWN_ENABLE_MATH'] = '0'";
const ANDROID_MATH_PROPERTY = 'enrichedMarkdown.enableMath';

const withEnrichedMarkdownNoMath: ConfigPlugin = (config) => {
  config = withGradleProperties(config, (config) => {
    config.modResults = config.modResults.filter(
      (item) => !(item.type === 'property' && item.key === ANDROID_MATH_PROPERTY)
    );
    config.modResults.push({
      type: 'property',
      key: ANDROID_MATH_PROPERTY,
      value: 'false',
    });
    return config;
  });

  config = withDangerousMod(config, [
    'ios',
    (config) => {
      const podfile = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      const lines = fs
        .readFileSync(podfile, 'utf8')
        .split('\n')
        .filter((line) => !line.includes('ENRICHED_MARKDOWN_ENABLE_MATH'));
      lines.unshift(IOS_MATH_OPT_OUT);
      fs.writeFileSync(podfile, lines.join('\n'));
      return config;
    },
  ]);

  return config;
};

export default withEnrichedMarkdownNoMath;
