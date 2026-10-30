import { AbsoluteFill, Composition, continueRender, delayRender } from 'remotion';
import { Pomo } from '@/components/Pomo';
import { CssAnimationClock } from './anim';
import './styles.css';
import { Trailer } from './Trailer';
import { DURATION, FPS, H, W } from './timing';

// Nothing renders until the app's fonts are in (they are bundled, never fetched from the web).
const fonts = delayRender('fonts');
Promise.all(['600 100px Fredoka', '400 100px "Patrick Hand"', '400 40px Nunito', '700 40px Nunito'].map((f) => document.fonts.load(f))).then(() => continueRender(fonts));

export function Root() {
  return (
    <>
      <Composition id="Trailer" component={Trailer} width={W} height={H} fps={FPS} durationInFrames={DURATION} />
      {/* A still Pomo: only its own CSS animations move, for checking the animation clock. */}
      <Composition id="ClockTest" component={ClockTest} width={400} height={400} fps={FPS} durationInFrames={240} />
    </>
  );
}

function ClockTest() {
  return (
    <AbsoluteFill className="trailer" style={{ background: '#FDFBF7', alignItems: 'center', justifyContent: 'center' }}>
      <CssAnimationClock />
      <Pomo mood="flow" size={300} />
    </AbsoluteFill>
  );
}
