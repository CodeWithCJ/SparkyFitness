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
interface Cue {
  text: string;
  language?: string;
}
const queue: Cue[] = [];
let speaking = false;
// Bumped when a cue interrupts: stopping the cue being said fires its callback
// while the new one is already starting, and that must not run `next`.
let generation = 0;

function say({ text, language }: Cue): void {
  const mine = generation;
  speaking = true;
  speakRecordingCue(
    text,
    () => {
      if (mine === generation) next();
    },
    language
  );
}

function next(): void {
  const cue = queue.shift();
  if (cue === undefined) {
    speaking = false;
    endRecordingCues();
    return;
  }
  say(cue);
}

/** `language` is the BCP 47 tag the cue is written in; empty means the app's. */
export function speakWatchCue(
  text: string,
  interrupt: boolean,
  language?: string
): void {
  if (!text) return;
  const cue = { text, language: language || undefined };
  if (!speaking) beginRecordingCues();
  if (interrupt) {
    queue.length = 0;
    generation += 1;
    say(cue);
    return;
  }
  queue.push(cue);
  if (!speaking) next();
}

/** Forgets anything waiting, for tests and for when the bridge is unmounted. */
export function resetWatchCueRelay(): void {
  queue.length = 0;
  generation += 1;
  speaking = false;
}
