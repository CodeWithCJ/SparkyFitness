import {
  beginRecordingCues,
  endRecordingCues,
  speakRecordingCue,
} from './recordingCues';

/**
 * Says the cues a wrist-only run asks the phone to speak, so they come out of
 * the headphones paired to the phone. A cue marked `interrupt` (a step change,
 * a pause) is said at once and drops what was waiting; the rest queue behind
 * the cue being spoken, so two splits close together are both heard.
 */
const queue: string[] = [];
let speaking = false;
// Bumped when a cue interrupts: stopping the cue being said fires its callback
// while the new one is already starting, and that must not run `next`.
let generation = 0;

function say(text: string): void {
  const mine = generation;
  speaking = true;
  speakRecordingCue(text, () => {
    if (mine === generation) next();
  });
}

function next(): void {
  const text = queue.shift();
  if (text === undefined) {
    speaking = false;
    endRecordingCues();
    return;
  }
  say(text);
}

export function speakWatchCue(text: string, interrupt: boolean): void {
  if (!text) return;
  if (!speaking) beginRecordingCues();
  if (interrupt) {
    queue.length = 0;
    generation += 1;
    say(text);
    return;
  }
  queue.push(text);
  if (!speaking) next();
}

/** Forgets anything waiting, for tests and for when the bridge is unmounted. */
export function resetWatchCueRelay(): void {
  queue.length = 0;
  generation += 1;
  speaking = false;
}
