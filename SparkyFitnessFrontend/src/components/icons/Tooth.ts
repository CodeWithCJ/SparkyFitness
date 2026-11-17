import { createLucideIcon } from 'lucide-react';

/**
 * A tooth, drawn in Lucide's style (24 grid, 2px round strokes) because Lucide
 * ships no tooth icon. Used for oral care (#1862).
 */
const Tooth = createLucideIcon('Tooth', [
  [
    'path',
    {
      d: 'M7.5 3C4.5 3 2.5 5.3 2.5 8c0 1.6.6 3 1.4 4.3.6 1 .9 2.2 1.1 3.5.4 2.9 1.3 6.2 2.9 6.2 1.4 0 1.8-2.1 2.1-4 .3-1.8.8-3 2-3s1.7 1.2 2 3c.3 1.9.7 4 2.1 4 1.6 0 2.5-3.3 2.9-6.2.2-1.3.5-2.5 1.1-3.5.8-1.3 1.4-2.7 1.4-4.3 0-2.7-2-5-5-5-1.7 0-2.7.8-4.5.8S9.2 3 7.5 3z',
      key: 'tooth-outline',
    },
  ],
]);

export default Tooth;
