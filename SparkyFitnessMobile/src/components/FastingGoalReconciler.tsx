import { useCurrentFast, useFastingGoalReconciler } from '../hooks/useFasting';

/**
 * Headless owner of fasting goal-notification reconciliation — renders nothing.
 *
 * Mounted unconditionally on the Dashboard so reconciliation and the app-resume
 * refetch keep running even when the visual `FastingCard` is hidden via the
 * dashboard visibility setting. This must live in exactly ONE always-mounted
 * place; every other `useCurrentFast` consumer (the card, the detail screen) is
 * read-only.
 */
const FastingGoalReconciler: React.FC = () => {
  const { data: currentFast, isLoading, refetch } = useCurrentFast();
  useFastingGoalReconciler(currentFast, isLoading, refetch);
  return null;
};

export default FastingGoalReconciler;
