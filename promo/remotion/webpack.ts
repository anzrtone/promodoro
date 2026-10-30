import path from 'node:path';
import { enableTailwind } from '@remotion/tailwind';
import type { WebpackOverrideFn } from '@remotion/bundler';

const here = path.dirname(new URL(import.meta.url).pathname);
const mods = path.join(here, '..', 'node_modules');

/** `@/` points at the app's src (so <Pomo> is the real component), with one copy of React. */
export const webpackOverride: WebpackOverrideFn = (config) => {
  const withTw = enableTailwind(config, { configLocation: path.join(here, 'tailwind.config.js') });
  return {
    ...withTw,
    resolve: {
      ...withTw.resolve,
      alias: {
        ...(withTw.resolve?.alias as object),
        '@': path.join(here, '..', '..', 'src'),
        react: path.join(mods, 'react'),
        'react-dom': path.join(mods, 'react-dom'),
      },
    },
  };
};
