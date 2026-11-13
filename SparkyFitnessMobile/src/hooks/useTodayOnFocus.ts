import { useContext, useEffect, useState } from 'react';
import { NavigationContext } from '@react-navigation/native';

import { getTodayDate } from '../utils/dateUtils';

/**
 * Today's date, moved forward the next time the screen is focused, so a
 * window left open past midnight does not stay on yesterday. It reads
 * `NavigationContext` rather than `useFocusEffect`, which throws when a
 * screen test renders without a navigator.
 */
export function useTodayOnFocus(): string {
  const [today, setToday] = useState(getTodayDate);
  const navigation = useContext(NavigationContext);
  useEffect(() => {
    if (!navigation) return;
    return navigation.addListener('focus', () => {
      const now = getTodayDate();
      setToday((current) => (current === now ? current : now));
    });
  }, [navigation]);
  return today;
}
