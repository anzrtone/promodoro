/**
 * The dev log: a notebook page per release, newest first, with Pomo. When GitHub has a newer release its notes
 * sit on a sticky note at the top with the download link. Contact details live on the last sticky note.
 */
import { useState } from 'react';
import { ExternalLink, Mail, RefreshCw } from 'lucide-react';
import { DEVLOG, KIND_LABEL, type ChangeKind } from '@/content/devlog';
import { CONTACT_EMAIL, DISCORD_HANDLE, DISCORD_INVITE, ISSUES_URL, RELEASES_API } from '@/config/updates';
import { updateSettings, useSettings } from '@/db/settings';
import { closeDevLog, useDevLogOpen } from '@/features/devlog';
import { parseInline, parseNotes } from '@/features/releaseNotes';
import { checkForUpdates, currentVersion, dismissUpdate, newerRelease, type CheckResult } from '@/features/updates';
import { openLink } from '@/platform';
import { Pomo, type PomoMood } from './Pomo';
import { DiscordIcon } from './DiscordIcon';
import { cx, Sheet } from './ui';

const KIND_STYLE: Record<ChangeKind, string> = {
  new: 'bg-halo text-ink',
  better: 'bg-leaf/20 text-ink',
  fixed: 'bg-tomato/15 text-ink',
};

const formatDate = (iso: string) => {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((r, i) =>
        r.bold ? <strong key={i}>{r.text}</strong> : r.code ? <code key={i} className="rounded bg-ink/10 px-1 text-[0.9em]">{r.text}</code> : <span key={i}>{r.text}</span>,
      )}
    </>
  );
}

const CHECK_MESSAGE: Record<CheckResult, { mood: PomoMood; text: string }> = {
  update: { mood: 'cheering', text: 'A new release is waiting for you!' },
  current: { mood: 'happy', text: "You're on the latest release." },
  failed: { mood: 'puzzled', text: "Couldn't reach GitHub. Try again later." },
  skipped: { mood: 'sleepy', text: "This build doesn't check for updates." },
};

function UpdateNote() {
  const settings = useSettings();
  const release = newerRelease(settings);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true);
    setResult(await checkForUpdates({ force: true }));
    setBusy(false);
  };
  const msg = result ? CHECK_MESSAGE[result] : null;

  return (
    <div className="sticky-note relative mb-5 rotate-[-0.4deg] p-4 pt-5">
      <div className="washi" />
      {release ? (
        <>
          <div className="flex items-center gap-3">
            <Pomo mood="cheering" size={64} accessory={settings.accessory} />
            <div className="min-w-0 flex-1">
              <h3 className="font-hand text-[26px] leading-none text-tomato">v{release.version} is out!</h3>
              <p className="mt-1 text-sm text-ink/65">You have {currentVersion()}. {release.name !== release.version && release.name}</p>
            </div>
          </div>
          {release.body && (
            <div className="mt-3 max-h-48 overflow-y-auto rounded-xl bg-sheet/70 p-3 text-sm text-ink/80">
              {parseNotes(release.body).map((b, i) =>
                b.type === 'h' ? (
                  <h4 key={i} className="mt-2 font-bold first:mt-0"><Inline text={b.text} /></h4>
                ) : b.type === 'li' ? (
                  <p key={i} className="flex gap-2"><span className="text-tomato">•</span><span><Inline text={b.text} /></span></p>
                ) : (
                  <p key={i} className="mt-1"><Inline text={b.text} /></p>
                ),
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => void openLink(release.url)}>
              <ExternalLink size={15} /> Get it on GitHub
            </button>
            {settings.dismissedUpdate !== release.version && (
              <button className="btn-ghost" onClick={() => void dismissUpdate(release.version)}>Maybe later</button>
            )}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3">
          <Pomo mood={msg?.mood ?? 'happy'} size={56} accessory={settings.accessory} />
          <div className="min-w-0 flex-1">
            <p className="font-hand text-[22px] leading-tight">{msg?.text ?? `You're on ${currentVersion()}.`}</p>
            <p className="text-xs text-ink/55">
              {settings.updateCheckedAt ? `Last checked ${new Date(settings.updateCheckedAt).toLocaleDateString()}.` : 'Not checked yet.'}
            </p>
          </div>
          {RELEASES_API && (
            <button className="btn-soft" onClick={() => void check()} disabled={busy}>
              <RefreshCw size={14} className={cx(busy && 'animate-spin')} /> Check
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Contact() {
  return (
    <div className="sticky-note relative mt-6 rotate-[0.5deg] p-4 pt-5">
      <div className="washi" />
      <div className="flex items-start gap-3">
        <Pomo mood="shy" size={52} />
        <div className="min-w-0 flex-1">
          <h3 className="font-hand text-[24px] leading-none text-tomato">Found a bug? Tell Pomo!</h3>
          <p className="mt-1 text-sm text-ink/70">Ideas, bugs or just a hello are all welcome.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn-soft" onClick={() => void openLink(`mailto:${CONTACT_EMAIL}`)}>
              <Mail size={14} /> {CONTACT_EMAIL}
            </button>
            <button className="btn-soft" onClick={() => void openLink(ISSUES_URL)}>
              <ExternalLink size={14} /> GitHub Issues
            </button>
            <button className="btn-soft" onClick={() => void openLink(DISCORD_INVITE)} title="Join the Promodoro Discord">
              <DiscordIcon size={15} /> {DISCORD_HANDLE}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DevLogSheet() {
  const open = useDevLogOpen();
  const current = currentVersion();
  return (
    <Sheet open={open} onClose={closeDevLog} title="Dev log" wide>
      <UpdateNote />
      <div className="bg-notebook rounded-2xl border border-rule py-3 pr-4 [--pm-line:32px] [--pm-margin-x:36px]" style={{ backgroundPositionY: '2px' }}>
        {DEVLOG.map((e, i) => (
          <article key={e.version} className="pl-[52px]">
            <header className="flex h-[32px] items-baseline gap-3">
              <h3 className="font-hand text-[26px] leading-[32px] text-tomato">v{e.version}</h3>
              <span className="font-hand text-[18px] leading-[32px] text-ink/50">{formatDate(e.date)}</span>
              {e.version === current && <span className="rounded-full bg-halo px-2 text-[11px] font-bold leading-5 text-ink">you are here</span>}
            </header>
            <p className="font-hand text-[19px] leading-[32px] text-ink/75">{e.note}</p>
            <ul>
              {e.changes.map((c, j) => (
                <li key={j} className="flex items-start gap-2 text-[14px] leading-[32px]">
                  <span className={cx('mt-[6px] h-5 w-12 shrink-0 rounded-full text-center text-[11px] font-bold leading-5', KIND_STYLE[c.kind])}>{KIND_LABEL[c.kind]}</span>
                  <span className="min-w-0 flex-1">{c.text}</span>
                </li>
              ))}
            </ul>
            {i < DEVLOG.length - 1 && <div className="h-[32px]" />}
          </article>
        ))}
      </div>
      <Contact />
    </Sheet>
  );
}

/** Stored so the pill and Settings can show the same state without re-asking. */
export const markVersionSeen = () => updateSettings({ lastSeenVersion: currentVersion() });
