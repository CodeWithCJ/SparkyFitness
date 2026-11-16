import {
  watchDemoFields,
  watchDemoImagePaths,
} from '../../src/utils/watchExerciseImages';

describe('watchDemoFields', () => {
  it('names the key, count and muscle for an exercise with two pictures', () => {
    expect(
      watchDemoFields({
        id: 'ex-1',
        images: ['a/0.jpg', 'a/1.jpg', 'a/2.jpg'],
        primary_muscles: ['chest'],
      })
    ).toEqual({ imageKey: 'ex-1', imageCount: 2, muscle: 'Chest' });
  });

  it('sends a single picture as a still', () => {
    expect(watchDemoFields({ id: 'ex-1', images: ['a/0.jpg'] })).toEqual({
      imageKey: 'ex-1',
      imageCount: 1,
    });
  });

  it('leaves the image fields out without pictures or an id', () => {
    expect(watchDemoFields({ id: 'ex-1', images: [] })).toEqual({});
    expect(watchDemoFields({ images: ['a/0.jpg'] })).toEqual({});
    expect(watchDemoFields(null)).toEqual({});
  });

  it('keeps only the first two usable paths', () => {
    expect(watchDemoImagePaths({ images: ['', 'a', 'b', 'c'] })).toEqual([
      'a',
      'b',
    ]);
  });
});
