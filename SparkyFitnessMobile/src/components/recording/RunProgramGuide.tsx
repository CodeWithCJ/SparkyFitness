import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { isZone2Program } from '@workspace/shared';
import Icon from '../Icon';
import { programName } from './RunProgramCard';

/** What the weeks of a program look like, in a sentence or two. */
export function programStructure(t: TFunction, id: string): string {
  switch (id) {
    case 'beginner5k':
      return t('runPrograms.guide.structure.beginner5k', {
        defaultValue:
          'Weeks 1 to 4 alternate short runs with walks, starting at 1 minute of running and building to 5-minute runs. Weeks 5 and 6 mix run and walk intervals with one continuous run. Weeks 7 to 9 are continuous runs of 25, 28 and then 30 minutes.',
      });
    case 'walkFit':
      return t('runPrograms.guide.structure.walkFit', {
        defaultValue:
          'Weeks 1 to 4 alternate stretches of brisk walking (3 to 8 minutes) with 2 minutes of easy walking. Weeks 5 and 6 use two longer brisk stretches of 12 and 15 minutes. Weeks 7 and 8 are continuous brisk walks of 20 to 30 minutes.',
      });
    case 'fiveToTenK':
      return t('runPrograms.guide.structure.fiveToTenK', {
        defaultValue:
          'Each week has two steady runs and a long run. The long run grows from 40 to 65 minutes. Every fourth week is lighter so you can recover, and the last week eases off.',
      });
    case 'zone2Base':
      return t('runPrograms.guide.structure.zone2Base', {
        defaultValue:
          'Each week has a short run, a middle run and a long run, all easy and held to Zone 2. Time in zone grows from 100 to 155 minutes a week, the long run from 40 to 70 minutes, and weeks 4 and 8 are lighter. Weeks 6, 7 and 9 end the short run with four relaxed strides. The middle run of weeks 4, 8 and 10 is a zone check.',
      });
    case 'zone2Base4':
      return t('runPrograms.guide.structure.zone2Base4', {
        defaultValue:
          'Each week has two short runs, a middle run and a long run, all easy and held to Zone 2. Time in zone grows from 130 to 190 minutes a week, the long run from 40 to 70 minutes, and weeks 4 and 8 are lighter. Weeks 6, 7 and 9 end the first run with four relaxed strides. The middle run of weeks 4, 8 and 10 is a zone check.',
      });
    case 'faster5k':
      return t('runPrograms.guide.structure.faster5k', {
        defaultValue:
          'Each week has a speed session (fast and easy repeats), an easy run and a longer run. In weeks 1 to 3 the longer run is easy; in weeks 4 to 6 it becomes a tempo run of 15, 20 and then 25 minutes.',
      });
    case 'halfMarathon':
      return t('runPrograms.guide.structure.halfMarathon', {
        defaultValue:
          'Each week has an easy run, a middle run and a long run. The long run builds from 50 to 115 minutes, every fourth week is lighter, and the last week is short before race day.',
      });
    case 'marathon':
      return t('runPrograms.guide.structure.marathon', {
        defaultValue:
          'Most weeks have two easy runs, a middle run and a long run. The long run builds from 70 minutes to 2¾ hours, every fourth week is lighter, and the last two weeks taper before race day.',
      });
    case 'walk10k':
      return t('runPrograms.guide.structure.walk10k', {
        defaultValue:
          'Each week has two walks of brisk stretches with short easy breaks and one long brisk walk. The long walk grows from 40 to 105 minutes, weeks 4 and 8 are lighter, and the last week ends with the 10K walk.',
      });
    case 'returnToRunning':
      return t('runPrograms.guide.structure.returnToRunning', {
        defaultValue:
          'Weeks 1 to 3 alternate short runs with walks, from 1-minute runs to 5-minute runs. Week 4 has three run/walk sessions with runs of 6, 10 and 12 minutes, adding up to 18, 20 and 22 minutes of running.',
      });
    case 'gentle5k':
      return t('runPrograms.guide.structure.gentle5k', {
        defaultValue:
          'Every week repeats one run/walk session three times. The runs grow from 30 seconds to 5 minutes by week 8, then to two 10-minute runs, a 15 and a 10-minute run, and finally continuous runs of 25 and 30 minutes.',
      });
    case 'beginner10k':
      return t('runPrograms.guide.structure.beginner10k', {
        defaultValue:
          'Weeks 1 to 6 follow the beginner 5K build from short runs and walks to continuous running. Weeks 7 to 12 are three runs a week. The long run grows from 30 to 60 minutes, and week 10 is lighter.',
      });
    case 'faster10k':
      return t('runPrograms.guide.structure.faster10k', {
        defaultValue:
          'Each week has a speed session (fast repeats or hills), an easy run and a longer run. Week 4 is lighter. In weeks 5 to 7 the longer run is a tempo run of 20, 25 and then 30 minutes, and the last week eases off.',
      });
    case 'tenKToHalf':
      return t('runPrograms.guide.structure.tenKToHalf', {
        defaultValue:
          'Each week has a short run, a middle run and a long run. The long run builds from 65 to 115 minutes, weeks 4 and 8 are lighter, and the last two weeks taper before race day.',
      });
    case 'fasterHalf':
      return t('runPrograms.guide.structure.fasterHalf', {
        defaultValue:
          'Each week has a speed session, an easy run and a long run. The long run builds from 70 to 110 minutes, tempo runs of 25 and 30 minutes replace the speed session in weeks 6 and 8, and the last two weeks taper.',
      });
    case 'beginnerMarathon':
      return t('runPrograms.guide.structure.beginnerMarathon', {
        defaultValue:
          'Each week has a short run, a middle run and a long run. The long run builds from 70 minutes to 2½ hours, every fourth week is lighter, and the last three weeks taper before race day.',
      });
    case 'advancedMarathon':
      return t('runPrograms.guide.structure.advancedMarathon', {
        defaultValue:
          'Most weeks have two easy runs, a speed, hill or tempo session, a middle run and a long run. Most easy runs from week 3 end with strides. From week 9 the long run includes a block at marathon pace, except in the lighter weeks. The long run builds from 90 minutes to three hours, every fourth week is lighter, and the last two weeks taper before race day.',
      });
    case 'halfMarathon4':
      return t('runPrograms.guide.structure.halfMarathon4', {
        defaultValue:
          'Each week has two easy runs, a middle run and a long run. The long run builds from 50 to 115 minutes, every fourth week is lighter, and the last two weeks taper before race day. The final week has three shorter runs.',
      });
    case 'tenKToHalf4':
      return t('runPrograms.guide.structure.tenKToHalf4', {
        defaultValue:
          'Each week has two short runs, a middle run and a long run. The long run builds from 65 to 115 minutes, weeks 4 and 8 are lighter, and the last two weeks taper before race day. The final week has three shorter runs.',
      });
    case 'fasterHalf4':
      return t('runPrograms.guide.structure.fasterHalf4', {
        defaultValue:
          'Each week has a speed session, two easy runs and a long run. The long run builds from 70 to 110 minutes. Tempo runs of 25 and 30 minutes replace the speed session in weeks 6 and 8, week 4 is lighter, and the last three weeks taper before race day. The final week has three shorter runs.',
      });
    case 'beginnerMarathon4':
      return t('runPrograms.guide.structure.beginnerMarathon4', {
        defaultValue:
          'Each week has two short runs, a middle run and a long run. The long run builds from 70 minutes to 2½ hours, every fourth week is lighter, and the last three weeks taper before race day. The final week has three shorter runs.',
      });
    default:
      return '';
  }
}

/** Rest-day advice for a program: how to space its workouts across the week. */
export function programRest(t: TFunction, id: string): string {
  switch (id) {
    case 'beginner5k':
    case 'walkFit':
    case 'walk10k':
    case 'gentle5k':
    case 'beginner10k':
      return t('runPrograms.guide.rest.beginner', {
        defaultValue:
          'Do not train on back-to-back days. Three workouts a week with a rest day between them, for example Monday, Wednesday and Saturday, gives your legs time to adapt. On rest days walk, stretch or do something gentle.',
      });
    case 'fiveToTenK':
      return t('runPrograms.guide.rest.fiveToTenK', {
        defaultValue:
          'Keep a rest day between the two steady runs, and put the long run a day or two after a rest day. Rest or cross-train (cycling, swimming, an easy walk) on the other days.',
      });
    case 'zone2Base':
      return t('runPrograms.guide.rest.zone2Base', {
        defaultValue:
          'Keep a rest day between runs where you can, and put the long run a day or two after a rest day. Easy runs add up quickly, so if you feel flat, take the day off rather than running harder. Rest or cross-train on the other days.',
      });
    case 'faster5k':
    case 'faster10k':
    case 'fasterHalf':
      return t('runPrograms.guide.rest.faster5k', {
        defaultValue:
          'Give the speed session and the longer run an easy day or a rest day on each side. Never do them back to back. Spend the free days resting or cross-training gently.',
      });
    case 'returnToRunning':
      return t('runPrograms.guide.rest.returnToRunning', {
        defaultValue:
          'Leave a day or two between runs, for example Monday, Thursday and Saturday, and keep every run easy and conversational. Rest, walk or cycle gently on the other days. If anything hurts more as you go, drop back to the previous week.',
      });
    case 'zone2Base4':
    case 'halfMarathon4':
    case 'tenKToHalf4':
    case 'fasterHalf4':
    case 'beginnerMarathon4':
      return t('runPrograms.guide.rest.fourRun', {
        defaultValue:
          'With four runs a week, take at least one full rest day and never run more than two days in a row. Keep the day before the long run easy or free, and rest or cross-train the day after it. Use the other days for rest, walking or low-impact cross-training.',
      });
    case 'advancedMarathon':
      return t('runPrograms.guide.rest.advanced', {
        defaultValue:
          'With five runs a week, take two rest or cross-training days and avoid more than two runs in a row. Keep the speed or tempo session and the long run at least two days apart, keep the days either side of them easy, and rest more in the lighter weeks.',
      });
    case 'halfMarathon':
    case 'tenKToHalf':
    case 'beginnerMarathon':
    case 'marathon':
      return t('runPrograms.guide.rest.longDistance', {
        defaultValue:
          'Keep the day before the long run easy or free, and take a rest day the day after it. Space the other runs so no two hard days sit together, and use spare days for rest, walking or low-impact cross-training.',
      });
    default:
      return '';
  }
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <View className="mt-3">
    <Text className="text-text-primary text-sm font-semibold">{title}</Text>
    <Text className="text-text-secondary text-sm mt-1">{children}</Text>
  </View>
);

/**
 * "How the plans work": what a workout is made of, how hard each part should
 * feel, and what pace to walk at. Effort-based on purpose, since the same pace
 * is easy for one person and hard for another.
 */
const RunProgramGuide: React.FC<{
  /** The program being followed, to describe its weeks as well. */
  programId?: string;
  defaultOpen?: boolean;
}> = ({ programId, defaultOpen = false }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const title = t('runPrograms.guide.title', {
    defaultValue: 'How the plans work',
  });

  return (
    <View className="bg-surface rounded-xl p-4 mt-4" testID="run-program-guide">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        className="flex-row items-center justify-between"
      >
        <Text className="text-text-primary text-base font-semibold">
          {title}
        </Text>
        <Icon
          name={open ? 'chevron-down' : 'chevron-forward'}
          size={18}
          color="#999"
        />
      </Pressable>
      {open ? (
        <View>
          {programId ? (
            <Section title={programName(t, programId)}>
              {programStructure(t, programId)}
            </Section>
          ) : null}
          <Section
            title={t('runPrograms.guide.workout.title', {
              defaultValue: 'Each workout',
            })}
          >
            {t('runPrograms.guide.workout.body', {
              defaultValue:
                'A workout starts with a warm-up walk (a gentle jog before speed sessions), then its steps in order, then a cool-down walk. The app tells you when to switch, so you can put your phone away. Weeks are not tied to the calendar: if you miss a workout, the same one stays due.',
            })}
          </Section>
          <Section
            title={t('runPrograms.guide.run.title', {
              defaultValue: 'How hard to run',
            })}
          >
            {t('runPrograms.guide.run.body', {
              defaultValue:
                'Go by effort, not pace. Run slowly enough that you could talk in short sentences. If you cannot, slow down or take a walk break early. Beginner runs should feel easy to moderate, around 4 to 5 out of 10. Easy runs stay conversational, tempo runs feel comfortably hard (about 6 to 7 out of 10), and the fast pieces in speed sessions feel hard but controlled (7 to 8 out of 10), with the easy pieces between them a relaxed jog.',
            })}
          </Section>
          {programId && isZone2Program(programId) ? (
            <Section
              title={t('runPrograms.guide.zone2.title', {
                defaultValue: 'Zone 2 runs',
              })}
            >
              {`${t('runPrograms.guide.zone2.body', {
                defaultValue:
                  'Zone 2 is easy aerobic running: about 60 to 70 percent of your maximum heart rate. Zone 2 runs are held to a heart rate range, not a pace, because the same pace is harder on a hot day or a tired week. The Record screen shows the range and tells you when you are above or below it. If you have no heart rate reading, use the talk test: you should be able to speak in full sentences. Heart rate drifts up a little on a long run, so the top of the range loosens after 20 minutes. If your breathing is easy, a few beats over is fine; if it feels harder, slow down or walk. The range comes from your own heart rate zone settings; if you have not set a maximum, it is an estimate from your age, which can be off by ten beats or more either way. If it feels too easy or too hard, trust the talk test.',
              })}\n\n${t('runPrograms.guide.zone2.check', {
                defaultValue:
                  'Weeks 4, 8 and 10 each have a zone check: the middle run. Run it on the same flat, familiar route at the same heart rate or effort, and compare your pace with the last one. If it is faster at the same effort, your base is growing. If you are slower, do not push: sleep, heat and stress show up here.',
              })}`}
            </Section>
          ) : null}
          <Section
            title={t('runPrograms.guide.efforts.title', {
              defaultValue: 'Strides, hills, tempo and marathon pace',
            })}
          >
            {t('runPrograms.guide.efforts.body', {
              defaultValue:
                'A stride is a short, quick, relaxed effort of about 20 seconds, followed by a walk or jog back, done at the end of an easy run to loosen up. Hill repeats are hard efforts uphill with an easy walk or jog back down; pace does not matter on a hill, so judge them by effort. A tempo run is a steady stretch you could hold for about an hour, comfortably hard. Marathon pace is the pace you plan to hold on race day: practise it in the second half of long runs.',
            })}
          </Section>
          <Section
            title={t('runPrograms.guide.pace.title', {
              defaultValue: 'Pace ranges',
            })}
          >
            {t('runPrograms.guide.pace.body', {
              defaultValue:
                'Enter a recent race time under Your race pace and the Record screen can suggest a pace range for each kind of stretch. They are estimates: heat, hills or a tired week will change them, so use them as a guide and go by effort when the two disagree.',
            })}
          </Section>
          <Section
            title={t('runPrograms.guide.walk.title', {
              defaultValue: 'How fast to walk',
            })}
          >
            {t('runPrograms.guide.walk.body', {
              defaultValue:
                'Walk briskly but comfortably, about 5 to 6 km/h (3 to 3.5 mph), which is roughly 10 to 12 minutes per kilometer or 16 to 19 minutes per mile. Keep moving rather than stopping: the walks are for getting your breath back, so you should be able to talk normally by the end of each one. The warm-up and cool-down walks can be a little easier.',
            })}
          </Section>
          {programId && programRest(t, programId) ? (
            <Section
              title={t('runPrograms.guide.rest.title', {
                defaultValue: 'Rest days',
              })}
            >
              {programRest(t, programId)}
            </Section>
          ) : null}
          <Section
            title={t('runPrograms.guide.listen.title', {
              defaultValue: 'Listening to your body',
            })}
          >
            {t('runPrograms.guide.listen.body', {
              defaultValue:
                'Aches that settle after a day are normal; sharp or lasting pain is not, so stop and rest. If a week was too hard, repeat it or ask Sparky to ease the next workouts. Leave a rest day between workouts while you are starting out. This is general guidance, not medical advice: if you are unsure about starting a new exercise plan, check with your doctor first.',
            })}
          </Section>
        </View>
      ) : null}
    </View>
  );
};

export default RunProgramGuide;
