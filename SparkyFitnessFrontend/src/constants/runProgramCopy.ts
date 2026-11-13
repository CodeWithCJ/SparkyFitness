/** English copy for the built-in training programs; also the i18n defaults. Keys under `trainingPrograms.programs.<id>` in the locale file mirror it. */
export interface ProgramCopy {
  name: string;
  description: string;
  structure: string;
}

export const PROGRAM_COPY: Readonly<Record<string, ProgramCopy>> = {
  walkFit: {
    name: 'Walk for fitness',
    description:
      'Walk for fitness: eight weeks, three walks a week, with no running. You alternate brisk and easy walking and build up to 30 minutes of brisk walking.',
    structure:
      'Weeks 1 to 4 alternate stretches of brisk walking (3 to 8 minutes) with 2 minutes of easy walking. Weeks 5 and 6 use two longer brisk stretches of 12 and 15 minutes. Weeks 7 and 8 are continuous brisk walks of 20 to 30 minutes.',
  },
  walk10k: {
    name: 'Brisk walk 10K',
    description:
      'Brisk walk 10K: ten weeks, three walks a week, with no running. You build up to a 10K walk of about an hour and three quarters.',
    structure:
      'Each week has two walks of brisk stretches with short easy breaks and one long brisk walk. The long walk grows from 40 to 105 minutes, weeks 4 and 8 are lighter, and the last week ends with the 10K walk.',
  },
  returnToRunning: {
    name: 'Return to running',
    description:
      'Return to running: four weeks, three runs a week, for easing back in after a break. You build from one-minute runs to about 20 minutes of running. Leave a day or two between runs and keep the pace easy. If you are coming back from an injury, check with a physio or doctor first.',
    structure:
      'Weeks 1 to 3 alternate short runs with walks, from 1-minute runs to 5-minute runs. Week 4 has three run/walk sessions with runs of 6, 10 and 12 minutes, adding up to 18, 20 and 22 minutes of running.',
  },
  gentle5k: {
    name: 'Gentle 5K',
    description:
      'Gentle 5K: twelve weeks, three runs a week. A slower start than Beginner 5K, with very short runs between long walks, building to 30 minutes of running.',
    structure:
      'Every week repeats one run/walk session three times. The runs grow from 30 seconds to 5 minutes by week 8, then to two 10-minute runs, a 15 and a 10-minute run, and finally continuous runs of 25 and 30 minutes.',
  },
  beginner5k: {
    name: 'Beginner 5K',
    description:
      'Beginner 5K: nine weeks, three runs a week. You alternate running and walking, and build up to 30 minutes of running.',
    structure:
      'Weeks 1 to 4 alternate short runs with walks, starting at 1 minute of running and building to 5-minute runs. Weeks 5 and 6 mix run and walk intervals with one continuous run. Weeks 7 to 9 are continuous runs of 25, 28 and then 30 minutes.',
  },
  fiveToTenK: {
    name: '5K to 10K',
    description:
      '5K to 10K: eight weeks, three runs a week, for when you can run 30 minutes. It builds to a 65 minute long run.',
    structure:
      'Each week has two steady runs and a long run. The long run grows from 40 to 65 minutes. Every fourth week is lighter so you can recover, and the last week eases off.',
  },
  faster5k: {
    name: 'Faster 5K',
    description:
      'Faster 5K: six weeks of speed sessions, easy runs and tempo runs, for when you already run 5K.',
    structure:
      'Each week has a speed session (fast and easy repeats), an easy run and a longer run. In weeks 1 to 3 the longer run is easy; in weeks 4 to 6 it becomes a tempo run of 15, 20 and then 25 minutes.',
  },
  beginner10k: {
    name: 'Beginner 10K',
    description:
      'Beginner 10K: twelve weeks, three runs a week, starting from walking. You build up to running for an hour.',
    structure:
      'Weeks 1 to 6 follow the beginner 5K build from short runs and walks to continuous running. Weeks 7 to 12 are three runs a week. The long run grows from 30 to 60 minutes, and week 10 is lighter.',
  },
  faster10k: {
    name: 'Faster 10K',
    description:
      'Faster 10K: eight weeks of speed sessions, easy runs and tempo runs, for when you already run 10K.',
    structure:
      'Each week has a speed session (fast repeats or hills), an easy run and a longer run. Week 4 is lighter. In weeks 5 to 7 the longer run is a tempo run of 20, 25 and then 30 minutes, and the last week eases off.',
  },
  tenKToHalf: {
    name: '10K to half marathon',
    description:
      '10K to half marathon: ten weeks, three runs a week, for when you can run 10K. Long runs build from 65 to 115 minutes.',
    structure:
      'Each week has a short run, a middle run and a long run. The long run builds from 65 to 115 minutes, weeks 4 and 8 are lighter, and the last two weeks taper before race day.',
  },
  tenKToHalf4: {
    name: '10K to half marathon (4 runs a week)',
    description:
      '10K to half marathon: ten weeks, four runs a week, with long runs building to about two hours. For when you can run 10K.',
    structure:
      'Each week has two short runs, a middle run and a long run. The long run builds from 65 to 115 minutes, weeks 4 and 8 are lighter, and the last two weeks taper before race day. The final week has three shorter runs.',
  },
  halfMarathon: {
    name: 'Half marathon',
    description:
      'Half marathon: twelve weeks, three runs a week, with long runs building to about two hours. For when you run 30 minutes comfortably.',
    structure:
      'Each week has an easy run, a middle run and a long run. The long run builds from 50 to 115 minutes, every fourth week is lighter, and the last week is short before race day.',
  },
  halfMarathon4: {
    name: 'Half marathon (4 runs a week)',
    description:
      'Half marathon: twelve weeks, four runs a week, with long runs building to about two hours. For when you run 30 minutes comfortably.',
    structure:
      'Each week has two easy runs, a middle run and a long run. The long run builds from 50 to 115 minutes, every fourth week is lighter, and the last two weeks taper before race day. The final week has three shorter runs.',
  },
  zone2Base: {
    name: 'Zone 2 base',
    description:
      'Zone 2 base: ten weeks, three easy runs a week held to your Zone 2 heart rate (or the talk test), building time in zone with a long run of up to 70 minutes. For when you can run 30 minutes.',
    structure:
      'Each week has a short run, a middle run and a long run, all easy and held to Zone 2. Time in zone grows from 100 to 155 minutes a week, the long run from 40 to 70 minutes, and weeks 4 and 8 are lighter. Weeks 6, 7 and 9 end the short run with four relaxed strides. The middle run of weeks 4, 8 and 10 is a zone check.',
  },
  zone2Base4: {
    name: 'Zone 2 base (4 runs a week)',
    description:
      'Zone 2 base: ten weeks, four easy runs a week held to your Zone 2 heart rate (or the talk test), building time in zone with a long run of up to 70 minutes. For when you can run 30 minutes.',
    structure:
      'Each week has two short runs, a middle run and a long run, all easy and held to Zone 2. Time in zone grows from 130 to 190 minutes a week, the long run from 40 to 70 minutes, and weeks 4 and 8 are lighter. Weeks 6, 7 and 9 end the first run with four relaxed strides. The middle run of weeks 4, 8 and 10 is a zone check.',
  },
  fasterHalf: {
    name: 'Faster half marathon',
    description:
      'Faster half marathon: ten weeks of speed sessions, easy runs and long runs with tempo work, for when you have run a half marathon before.',
    structure:
      'Each week has a speed session, an easy run and a long run. The long run builds from 70 to 110 minutes, tempo runs of 25 and 30 minutes replace the speed session in weeks 6 and 8, and the last two weeks taper.',
  },
  fasterHalf4: {
    name: 'Faster half marathon (4 runs a week)',
    description:
      'Faster half marathon: ten weeks, four runs a week, with a speed session, easy runs and a long run. For when you have run a half marathon before.',
    structure:
      'Each week has a speed session, two easy runs and a long run. The long run builds from 70 to 110 minutes. Tempo runs of 25 and 30 minutes replace the speed session in weeks 6 and 8, week 4 is lighter, and the last three weeks taper before race day. The final week has three shorter runs.',
  },
  beginnerMarathon: {
    name: 'Beginner marathon',
    description:
      'Beginner marathon: eighteen weeks, three runs a week, with long runs building to 2½ hours and a taper. For when you can run 10K.',
    structure:
      'Each week has a short run, a middle run and a long run. The long run builds from 70 minutes to 2½ hours, every fourth week is lighter, and the last three weeks taper before race day.',
  },
  beginnerMarathon4: {
    name: 'Beginner marathon (4 runs a week)',
    description:
      'Beginner marathon: eighteen weeks, four runs a week, with long runs building to 2½ hours and a taper. For when you can run 10K.',
    structure:
      'Each week has two short runs, a middle run and a long run. The long run builds from 70 minutes to 2½ hours, every fourth week is lighter, and the last three weeks taper before race day. The final week has three shorter runs.',
  },
  marathon: {
    name: 'Marathon',
    description:
      'Marathon: sixteen weeks, four runs a week, with long runs building to about 2¾ hours and a taper. For people who already run regularly.',
    structure:
      'Most weeks have two easy runs, a middle run and a long run. The long run builds from 70 minutes to 2¾ hours, every fourth week is lighter, and the last two weeks taper before race day.',
  },
  advancedMarathon: {
    name: 'Advanced marathon',
    description:
      'Advanced marathon: sixteen weeks, five runs a week, with speed or tempo work and long runs building to three hours. For experienced runners.',
    structure:
      'Most weeks have two easy runs, a speed, hill or tempo session, a middle run and a long run. Most easy runs from week 3 end with strides. From week 9 the long run includes a block at marathon pace, except in the lighter weeks. The long run builds from 90 minutes to three hours, every fourth week is lighter, and the last two weeks taper before race day.',
  },
};
