import React from 'react';
import FitnessRetestPrompt from './FitnessRetestPrompt';
import { useRunProgram } from '../../services/runProgramService';

/**
 * The retest offer as it appears with the training program on today's Diary:
 * only while a program is being followed, since that is when fresh paces help.
 */
const ProgramRetestPrompt: React.FC<{
  /** The day the Diary is showing, and today; the offer is for today only. */
  date: string;
  today: string;
  onRetest: () => void;
}> = ({ date, today, onRetest }) => {
  const { enabled, status } = useRunProgram();
  if (date !== today || !enabled || !status || status.finished) return null;
  return <FitnessRetestPrompt today={today} onRetest={onRetest} dismissible />;
};

export default ProgramRetestPrompt;
