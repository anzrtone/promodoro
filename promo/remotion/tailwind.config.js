// The app's Tailwind theme (colours, fonts, Pomo's animate-* keyframes), scanned over Pomo and the trailer.
import path from 'node:path';
import app from '../../tailwind.config.js';

const here = __dirname;

export default {
  ...app,
  content: [path.join(here, '../../src/components/Pomo.tsx'), path.join(here, '*.{ts,tsx}'), path.join(here, 'components/*.{ts,tsx}')],
};
