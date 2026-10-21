/**
 * Pomo — the angelic tomato timer. Pure SVG so it stays crisp at any size, animates
 * cheaply, recolours with the notebook theme, and can wear supporter accessories.
 *
 * Moods map to timer state: focused (work), sleepy (break), cheering (goal reached),
 * puzzled (paused / missed alarm), happy (idle), frustrated (sparingly, for humour).
 */
import { memo } from 'react';
import type { AccessoryId } from '@/db/settings';

export type PomoMood = 'happy' | 'focused' | 'flow' | 'sleepy' | 'cheering' | 'puzzled' | 'frustrated' | 'shy';

interface Props {
  mood: PomoMood;
  size?: number;
  accessory?: AccessoryId;
  /** 0..1 — the dial band rotates as time passes, like a real kitchen timer. */
  progress?: number;
  className?: string;
  onClick?: () => void;
  title?: string;
}

const INK = 'rgb(var(--pm-ink))';
const RED = '#EE6B6E';
const RED_DARK = '#D9545A';
const LEAF = '#52B788';
const LEAF_DARK = '#3F9E72';
const HALO = '#FFE893';
const BLUSH = '#F4A2A2';

const Sparkle = ({ x, y, s = 1, delay = 0 }: { x: number; y: number; s?: number; delay?: number }) => (
  <path
    d="M0 -8 C1 -2 2 -1 8 0 C2 1 1 2 0 8 C-1 2 -2 1 -8 0 C-2 -1 -1 -2 0 -8Z"
    transform={`translate(${x} ${y}) scale(${s})`}
    fill={HALO}
    stroke="#E9C85C"
    strokeWidth={0.8}
    className="animate-twinkle"
    style={{ animationDelay: `${delay}s`, transformBox: 'fill-box', transformOrigin: 'center' }}
  />
);

const Heart = ({ x, y, delay = 0 }: { x: number; y: number; delay?: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <path
      d="M0 4 C-6 -1 -6 -6 -2.5 -6 C-1 -6 0 -5 0 -4 C0 -5 1 -6 2.5 -6 C6 -6 6 -1 0 4Z"
      fill="none"
      stroke="#E9B949"
      strokeWidth={1.8}
      strokeLinejoin="round"
      className="animate-floatUp"
      style={{ animationDelay: `${delay}s`, animationIterationCount: 'infinite', transformBox: 'fill-box', transformOrigin: 'center' }}
    />
  </g>
);

function Eyes({ mood }: { mood: PomoMood }) {
  const L = 80;
  const R = 120;
  const Y = 110;
  const dot = (x: number, r = 5.6) => (
    <g key={x}>
      <circle cx={x} cy={Y} r={r} fill="#4A2525" />
      <circle cx={x + 1.8} cy={Y - 2} r={1.6} fill="#fff" />
    </g>
  );
  switch (mood) {
    case 'sleepy':
      return (
        <g stroke="#4A2525" strokeWidth={2.6} strokeLinecap="round" fill="none">
          <path d={`M${L - 6} ${Y} Q${L} ${Y + 5} ${L + 6} ${Y}`} />
          <path d={`M${R - 6} ${Y} Q${R} ${Y + 5} ${R + 6} ${Y}`} />
        </g>
      );
    case 'cheering':
      return (
        <g stroke="#4A2525" strokeWidth={2.8} strokeLinecap="round" fill="none">
          <path d={`M${L - 6} ${Y + 2} Q${L} ${Y - 6} ${L + 6} ${Y + 2}`} />
          <path d={`M${R - 6} ${Y + 2} Q${R} ${Y - 6} ${R + 6} ${Y + 2}`} />
        </g>
      );
    case 'puzzled':
      return (
        <g>
          {dot(L)}
          <path d={`M${R - 6} ${Y} L${R + 6} ${Y}`} stroke="#4A2525" strokeWidth={2.8} strokeLinecap="round" />
          <path d={`M${L - 7} ${Y - 11} Q${L} ${Y - 15} ${L + 6} ${Y - 11}`} stroke="#4A2525" strokeWidth={2} fill="none" strokeLinecap="round" />
          <path d={`M${R - 6} ${Y - 8} L${R + 7} ${Y - 12}`} stroke="#4A2525" strokeWidth={2} strokeLinecap="round" />
        </g>
      );
    case 'frustrated':
      return (
        <g>
          {dot(L, 5)}
          {dot(R, 5)}
          <g stroke="#4A2525" strokeWidth={2.6} strokeLinecap="round">
            <path d={`M${L - 8} ${Y - 12} L${L + 6} ${Y - 7}`} />
            <path d={`M${R + 8} ${Y - 12} L${R - 6} ${Y - 7}`} />
          </g>
        </g>
      );
    case 'focused':
    case 'flow':
      return (
        <g>
          {dot(L, 5.4)}
          {dot(R, 5.4)}
          <g stroke="#4A2525" strokeWidth={2} strokeLinecap="round" opacity={0.8}>
            <path d={`M${L - 7} ${Y - 11} L${L + 5} ${Y - 9}`} />
            <path d={`M${R + 7} ${Y - 11} L${R - 5} ${Y - 9}`} />
          </g>
        </g>
      );
    default:
      return (
        <g>
          {dot(L)}
          {dot(R)}
        </g>
      );
  }
}

function Mouth({ mood }: { mood: PomoMood }) {
  const Y = 122;
  switch (mood) {
    case 'cheering':
      return <path d={`M92 ${Y - 2} Q100 ${Y + 12} 108 ${Y - 2} Z`} fill="#C74B55" stroke="#4A2525" strokeWidth={2} strokeLinejoin="round" />;
    case 'happy':
      return <path d={`M94 ${Y - 1} Q100 ${Y + 8} 106 ${Y - 1} Z`} fill="#E77B83" stroke="#4A2525" strokeWidth={2} strokeLinejoin="round" />;
    case 'sleepy':
      return <ellipse cx={100} cy={Y + 1} rx={3} ry={3.6} fill="#4A2525" />;
    case 'puzzled':
      return <path d={`M93 ${Y} q3.5 -4 7 0 t7 0`} fill="none" stroke="#4A2525" strokeWidth={2.2} strokeLinecap="round" />;
    case 'frustrated':
      return <path d={`M94 ${Y + 3} Q100 ${Y - 4} 106 ${Y + 3}`} fill="none" stroke="#4A2525" strokeWidth={2.4} strokeLinecap="round" />;
    case 'focused':
      return <path d={`M95 ${Y} L105 ${Y}`} stroke="#4A2525" strokeWidth={2.4} strokeLinecap="round" />;
    default:
      return <path d={`M94 ${Y - 1} Q100 ${Y + 5} 106 ${Y - 1}`} fill="none" stroke="#4A2525" strokeWidth={2.4} strokeLinecap="round" />;
  }
}

function Wing({ side }: { side: 'l' | 'r' }) {
  const flip = side === 'l' ? '' : 'translate(200 0) scale(-1 1)';
  return (
    <g transform={flip}>
      <g className="animate-flap" style={{ transformOrigin: '52px 120px', animationDelay: side === 'l' ? '0s' : '0.15s' }}>
        <path
          d="M52 104 C36 92 18 98 20 110 C10 112 10 126 22 128 C16 138 28 146 38 140 C44 146 56 142 56 132 Z"
          fill="#FFFDF8"
          stroke="#E8DCCB"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <path d="M30 116 C36 118 42 118 48 116 M30 128 C36 130 42 130 48 127" stroke="#EADFCF" strokeWidth={1.6} fill="none" strokeLinecap="round" />
      </g>
    </g>
  );
}

function Accessory({ id }: { id: AccessoryId }) {
  switch (id) {
    case 'beret':
      return (
        <g>
          <ellipse cx={78} cy={62} rx={30} ry={11} transform="rotate(-14 78 62)" fill="#3B4A6B" />
          <circle cx={76} cy={50} r={3} fill="#3B4A6B" />
        </g>
      );
    case 'headphones':
      return (
        <g>
          <path d="M44 104 C40 50 160 50 156 104" fill="none" stroke="#5B6470" strokeWidth={6} strokeLinecap="round" />
          <rect x={33} y={96} width={16} height={26} rx={7} fill="#7FC8A9" stroke="#5B6470" strokeWidth={2} />
          <rect x={151} y={96} width={16} height={26} rx={7} fill="#7FC8A9" stroke="#5B6470" strokeWidth={2} />
        </g>
      );
    case 'scarf':
      return (
        <g>
          <path d="M46 136 Q100 160 154 136 L156 146 Q100 172 44 146 Z" fill="#F2C14E" stroke="#D9A73A" strokeWidth={1.5} />
          <path d="M132 150 L140 176 L126 176 L122 152 Z" fill="#F2C14E" stroke="#D9A73A" strokeWidth={1.5} />
        </g>
      );
    case 'party':
      return (
        <g transform="rotate(16 128 46)">
          <path d="M116 64 L130 22 L144 64 Z" fill="#8FB8E8" stroke="#6E98CC" strokeWidth={1.5} strokeLinejoin="round" />
          <path d="M120 54 L140 54 M124 42 L136 42" stroke="#fff" strokeWidth={3} />
          <circle cx={130} cy={21} r={4} fill={HALO} />
        </g>
      );
    case 'flower':
      return (
        <g transform="translate(136 70)">
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx={0} cy={-7} rx={4.5} ry={7} fill="#fff" stroke="#F4A2A2" strokeWidth={1} transform={`rotate(${a})`} />
          ))}
          <circle r={4} fill={HALO} />
        </g>
      );
    default:
      return null;
  }
}

function PomoSvg({ mood, size = 160, accessory = 'none', progress = 0, className, onClick, title }: Props) {
  const ticks = Array.from({ length: 23 }, (_, i) => i);
  const dialShift = -progress * 60; // the band slides as time runs, like turning the dial back to 0
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      onClick={onClick}
      role="img"
      aria-label={title ?? `Pomo looks ${mood}`}
      style={{ overflow: 'visible', cursor: onClick ? 'pointer' : undefined }}
    >
      <defs>
        <radialGradient id="pomo-body" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#F79B98" />
          <stop offset="55%" stopColor={RED} />
          <stop offset="100%" stopColor={RED_DARK} />
        </radialGradient>
        <clipPath id="pomo-clip">
          <circle cx={100} cy={114} r={62} />
        </clipPath>
        <filter id="pomo-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* soft glow under the halo while focusing */}
      {(mood === 'focused' || mood === 'flow') && <ellipse cx={100} cy={112} rx={74} ry={70} fill={HALO} opacity={0.35} filter="url(#pomo-soft)" />}

      <g className="animate-bob">
        <Wing side="l" />
        <Wing side="r" />

        {/* body */}
        <circle cx={100} cy={114} r={62} fill="url(#pomo-body)" />
        {/* dial band */}
        <g clipPath="url(#pomo-clip)">
          <path d="M34 134 Q100 160 166 134 L166 180 L34 180 Z" fill={RED_DARK} opacity={0.22} />
          <path d="M36 133 Q100 158 164 133" fill="none" stroke="#C9464E" strokeWidth={1.6} opacity={0.6} />
          <g transform={`translate(${dialShift % 12} 0)`}>
            {ticks.map((i) => {
              const x = 30 + i * 6.6;
              const t = (x - 36) / 128;
              const y = 133 + 25 * (1 - (2 * t - 1) ** 2) * 0.5 + 4;
              return <path key={i} d={`M${x} ${y} l0 ${i % 5 === 0 ? 7 : 4}`} stroke="#fff" strokeWidth={1.4} opacity={0.85} strokeLinecap="round" />;
            })}
          </g>
          <g fill="#fff" fontFamily="Fredoka, sans-serif" fontSize={10} fontWeight={600} textAnchor="middle" opacity={0.95}>
            <text x={62} y={160}>5</text>
            <text x={100} y={166}>0</text>
            <text x={140} y={160}>55</text>
          </g>
          <path d="M100 170 l5 7 h-10 z" fill="#fff" />
        </g>
        {/* shine */}
        <ellipse cx={72} cy={80} rx={11} ry={7} fill="#fff" opacity={0.35} transform="rotate(-30 72 80)" />
        <ellipse cx={136} cy={84} rx={6} ry={4} fill="#fff" opacity={0.3} />

        {/* face */}
        <ellipse cx={68} cy={124} rx={8.5} ry={5.5} fill={BLUSH} opacity={0.8} />
        <ellipse cx={132} cy={124} rx={8.5} ry={5.5} fill={BLUSH} opacity={0.8} />
        <Eyes mood={mood} />
        <Mouth mood={mood} />

        {/* leaves (a flattened five-point calyx) + stem */}
        <g transform="translate(100 60) scale(1 0.56)">
          {[18, 90, 162, 234, 306].map((a, i) => (
            <ellipse key={a} cx={0} cy={-17} rx={10.5} ry={19} fill={i % 2 ? LEAF_DARK : LEAF} stroke={LEAF_DARK} strokeWidth={1} transform={`rotate(${a})`} />
          ))}
          <circle r={9} fill={LEAF} />
        </g>
        <path d="M100 60 C100 52 99 46 102 40" stroke={LEAF_DARK} strokeWidth={8} strokeLinecap="round" fill="none" />
        {accessory !== 'none' && <Accessory id={accessory} />}
      </g>

      {/* halo floats separately */}
      <g className="animate-halo" style={{ transformOrigin: '100px 26px' }}>
        <ellipse cx={100} cy={26} rx={30} ry={8.5} fill="none" stroke="#F3D774" strokeWidth={7} />
        <ellipse cx={100} cy={26} rx={30} ry={8.5} fill="none" stroke={HALO} strokeWidth={4.5} />
      </g>

      {/* mood decorations */}
      {(mood === 'focused' || mood === 'flow' || mood === 'happy') && (
        <g>
          <Sparkle x={34} y={64} s={0.9} />
          <Sparkle x={170} y={56} s={1.1} delay={0.8} />
          {mood === 'flow' && <Sparkle x={176} y={150} s={0.7} delay={1.4} />}
          {mood === 'flow' && <Sparkle x={22} y={150} s={0.8} delay={0.4} />}
        </g>
      )}
      {mood === 'cheering' && (
        <g>
          <Heart x={36} y={70} />
          <Heart x={166} y={60} delay={0.7} />
          <Heart x={150} y={36} delay={1.3} />
          <Sparkle x={26} y={110} s={0.8} delay={0.3} />
        </g>
      )}
      {mood === 'shy' && (
        <g>
          <Heart x={40} y={70} />
          <Heart x={164} y={64} delay={0.9} />
        </g>
      )}
      {mood === 'sleepy' && (
        <g fill={INK} fontFamily="Caveat, cursive" fontWeight={700} opacity={0.55}>
          <text x={150} y={62} fontSize={18} className="animate-floatUp" style={{ animationIterationCount: 'infinite' }}>z</text>
          <text x={162} y={46} fontSize={24} className="animate-floatUp" style={{ animationIterationCount: 'infinite', animationDelay: '0.8s' }}>Z</text>
        </g>
      )}
      {mood === 'puzzled' && (
        <text x={150} y={58} fontSize={34} fontFamily="Fredoka, sans-serif" fontWeight={600} fill="#E9B949" className="animate-wiggle" style={{ animationIterationCount: 'infinite', animationDuration: '2s' }}>
          ?
        </text>
      )}
      {mood === 'frustrated' && (
        <g stroke="#E9B949" strokeWidth={3} strokeLinecap="round" transform="translate(156 48)">
          <path d="M-8 -4 q4 0 4 -4 M4 -8 q0 4 4 4 M8 4 q-4 0 -4 4 M-4 8 q0 -4 -4 -4" fill="none" />
        </g>
      )}
    </svg>
  );
}

export const Pomo = memo(PomoSvg);

/** Gentle, never-shaming lines Pomo says. */
export const POMO_LINES: Record<PomoMood, string[]> = {
  happy: ['Ready when you are!', 'One tap is all it takes.', 'Hi! Want to start something small?', 'Even five minutes counts.'],
  focused: ["You've got this.", "I'm right here with you.", 'Steady and cozy.', "I'll keep watch on the clock."],
  flow: ["Ooh, flow state! I'll keep counting.", 'Every extra minute is saved.', 'No need to stop if you don’t want to!'],
  sleepy: ['Stretch, sip, breathe…', 'Rest is part of the work.', 'zzz… (I’ll wake you)'],
  cheering: ['You did it!', 'That counts! ✨', 'Look at you go!'],
  puzzled: ['Taking a pause? That’s fine.', 'Hmm, where were we?', 'Forgot to start me? We can fix that!'],
  frustrated: ['Hey! That tickles!', 'I am a very serious timer.', 'Okay okay, I’m awake!'],
  shy: ['Oh! Hi again.', 'Welcome back. I missed you.'],
};
