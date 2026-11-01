module.exports = {
  dependencies: {
    // Android uses MapLibre Native for keyless OpenStreetMap vector tiles.
    // iOS draws cardio routes over native Apple Maps with react-native-maps,
    // so we exclude MapLibre from iOS autolinking to avoid native pod bloat.
    '@maplibre/maplibre-react-native': {
      platforms: {
        ios: null,
      },
    },
  },
};
