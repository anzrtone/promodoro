import plugin from 'tailwindcss/plugin';

/**
 * @promodoro design tokens.
 *
 * Every brand color is a CSS variable holding space-separated RGB channels so that
 * (a) Tailwind opacity modifiers work (`bg-tomato/20`) and
 * (b) notebook themes (Midnight Ink, Graph Paper, Sakura, Kraft) can swap the palette
 *     at runtime by changing `data-theme` on <html>. Defaults live in src/styles/index.css.
 */
const token = (name) => `rgb(var(--pm-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        creme: token('creme'), //   #FDFBF7 Notebook Crème: canvas
        paper: token('paper'), //   #F5EFE0 Warm Paper Yellow: cards, sticky notes
        tomato: token('tomato'), // #EE6B6E Pale Tomato Red: focus, primary actions
        leaf: token('leaf'), //     #52B788 Stem Leaf Green: rest, success
        halo: token('halo'), //     #FFE893 Halo Warm Yellow: halo, active pills, sparkles
        margin: token('margin'), // #F4A2A2 Margin Line Pink: vertical rule
        rule: token('rule'), //     #E5DFD1 Rule Line Sand: horizontal lines, borders
        ink: token('ink'), //       #2D312E Inky Soft Charcoal: all type (never #000)
        sheet: token('sheet'), //   card surface that sits on the paper (white-ish)
      },
      fontFamily: {
        display: ['Fredoka', 'Nunito', 'system-ui', 'sans-serif'],
        sans: ['Nunito', 'system-ui', 'sans-serif'],
        hand: ['"Patrick Hand"', 'Comic Sans MS', 'cursive'],
      },
      borderRadius: {
        note: '14px',
        card: '20px',
        sheet: '24px',
      },
      boxShadow: {
        // Never heavy dark shadows: soft, warm, low-contrast lifts only.
        note: '0 1px 0 rgb(var(--pm-rule)), 0 6px 18px -10px rgb(var(--pm-ink) / 0.18)',
        lift: '0 10px 30px -16px rgb(var(--pm-ink) / 0.25)',
        pill: 'inset 0 -2px 0 rgb(var(--pm-ink) / 0.08)',
      },
      spacing: {
        line: 'var(--pm-line)', // one notebook rule line (28px default)
      },
      keyframes: {
        bob: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-4px)' } },
        halo: { '0%,100%': { transform: 'translateY(0) rotate(-3deg)' }, '50%': { transform: 'translateY(-3px) rotate(3deg)' } },
        flap: { '0%,100%': { transform: 'rotate(0deg)' }, '50%': { transform: 'rotate(-12deg)' } },
        twinkle: { '0%,100%': { opacity: '0.2', transform: 'scale(0.7)' }, '50%': { opacity: '1', transform: 'scale(1)' } },
        floatUp: { '0%': { opacity: '0', transform: 'translateY(6px) scale(0.6)' }, '20%': { opacity: '1' }, '100%': { opacity: '0', transform: 'translateY(-46px) scale(1)' } },
        wiggle: { '0%,100%': { transform: 'rotate(0)' }, '25%': { transform: 'rotate(-6deg)' }, '75%': { transform: 'rotate(6deg)' } },
        pop: { '0%': { transform: 'scale(0.6)', opacity: '0' }, '70%': { transform: 'scale(1.08)', opacity: '1' }, '100%': { transform: 'scale(1)' } },
        fadeOut: { '0%': { opacity: '1', transform: 'scale(1) translateY(0)' }, '100%': { opacity: '0', transform: 'scale(0.85) translateY(8px)' } },
        breathe: { '0%,100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.025)' } },
        pageIn: { '0%': { opacity: '0', transform: 'translateX(18px) rotate(0.6deg)' }, '100%': { opacity: '1', transform: 'none' } },
        // A dropped item settles into its new spot with a brief warm glow.
        land: { '0%': { transform: 'scale(0.94)', backgroundColor: 'rgb(var(--pm-halo))' }, '45%': { transform: 'scale(1.02)' }, '100%': { transform: 'scale(1)' } },
        // A task line opens up, then the words are written in from the left.
        taskIn: { '0%': { maxHeight: '0', opacity: '0', transform: 'translateX(-10px)' }, '45%': { maxHeight: '48px', opacity: '0', transform: 'translateX(-10px)' }, '100%': { maxHeight: '48px', opacity: '1', transform: 'none' } },
        // ...and a deleted one slides off the page before its line closes up.
        taskOut: { '0%': { maxHeight: '48px', opacity: '1', transform: 'none' }, '55%': { maxHeight: '48px', opacity: '0', transform: 'translateX(24px) rotate(1.5deg)' }, '100%': { maxHeight: '0', opacity: '0', transform: 'translateX(24px) rotate(1.5deg)' } },
      },
      animation: {
        bob: 'bob 3.2s ease-in-out infinite',
        halo: 'halo 4s ease-in-out infinite',
        flap: 'flap 1.6s ease-in-out infinite',
        twinkle: 'twinkle 2.4s ease-in-out infinite',
        floatUp: 'floatUp 2.2s ease-out forwards',
        wiggle: 'wiggle 0.5s ease-in-out',
        pop: 'pop 0.45s cubic-bezier(.2,.9,.3,1.3) both',
        'fade-out': 'fadeOut 0.3s ease-in both',
        breathe: 'breathe 6s ease-in-out infinite',
        pageIn: 'pageIn 0.35s ease-out both',
        land: 'land 0.7s cubic-bezier(.2,.9,.3,1.2)',
        'task-in': 'taskIn 0.38s cubic-bezier(.2,.8,.3,1) both',
        'task-out': 'taskOut 0.32s ease-in both',
      },
    },
  },
  plugins: [
    plugin(({ addComponents, addUtilities }) => {
      addUtilities({
        // Lined notebook page: sand rule every --pm-line, pink margin rule on the left.
        '.bg-notebook': {
          backgroundColor: 'rgb(var(--pm-creme))',
          backgroundImage: [
            'linear-gradient(90deg, transparent var(--pm-margin-x), rgb(var(--pm-margin)) var(--pm-margin-x), rgb(var(--pm-margin)) calc(var(--pm-margin-x) + 1.5px), transparent calc(var(--pm-margin-x) + 1.5px))',
            'repeating-linear-gradient(180deg, transparent 0, transparent calc(var(--pm-line) - 1px), rgb(var(--pm-rule)) calc(var(--pm-line) - 1px), rgb(var(--pm-rule)) var(--pm-line))',
          ].join(','),
          backgroundAttachment: 'local',
        },
        // Same lines without the margin rule (for cards that sit inside a page).
        '.bg-lined': {
          backgroundImage:
            'repeating-linear-gradient(180deg, transparent 0, transparent calc(var(--pm-line) - 1px), rgb(var(--pm-rule) / 0.8) calc(var(--pm-line) - 1px), rgb(var(--pm-rule) / 0.8) var(--pm-line))',
        },
        '.bg-graph': {
          backgroundImage: [
            'linear-gradient(rgb(var(--pm-rule) / 0.7) 1px, transparent 1px)',
            'linear-gradient(90deg, rgb(var(--pm-rule) / 0.7) 1px, transparent 1px)',
          ].join(','),
          backgroundSize: '20px 20px',
        },
        '.margin-rule': {
          boxShadow: 'inset 2px 0 0 rgb(var(--pm-margin))',
        },
        '.tabular': { fontVariantNumeric: 'tabular-nums' },
        '.no-scrollbar': { scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } },
        '.safe-pt': { paddingTop: 'env(safe-area-inset-top)' },
        '.safe-pb': { paddingBottom: 'env(safe-area-inset-bottom)' },
      });
      addComponents({
        '.sticky-note': {
          backgroundColor: 'rgb(var(--pm-paper))',
          borderRadius: '14px',
          border: '1px solid rgb(var(--pm-rule))',
          boxShadow: '0 1px 0 rgb(var(--pm-rule)), 0 6px 18px -10px rgb(var(--pm-ink) / 0.18)',
        },
        // A strip of translucent washi tape that "holds" a note to the page.
        '.washi': {
          position: 'absolute',
          top: '-10px',
          left: '50%',
          width: '84px',
          height: '20px',
          transform: 'translateX(-50%) rotate(-2deg)',
          backgroundColor: 'rgb(var(--pm-halo) / 0.7)',
          borderRadius: '3px',
          backgroundImage: 'repeating-linear-gradient(45deg, rgb(255 255 255 / 0.25) 0 6px, transparent 6px 12px)',
        },
        '.pill': {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.4rem',
          borderRadius: '9999px',
          fontWeight: '700',
          lineHeight: '1',
          transition: 'transform 120ms ease, background-color 160ms ease, box-shadow 160ms ease, opacity 160ms ease',
          '&:active:not(:disabled)': { transform: 'scale(0.96)' },
          '&:disabled': { opacity: '0.45', cursor: 'not-allowed' },
          '&:focus-visible': { outline: '2px solid rgb(var(--pm-ink) / 0.6)', outlineOffset: '2px' },
        },
        '.ink-squiggle': {
          height: '8px',
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='8' viewBox='0 0 24 8'%3E%3Cpath d='M0 4 Q 6 0 12 4 T 24 4' fill='none' stroke='%23E5DFD1' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'repeat-x',
        },
      });
    }),
  ],
};
