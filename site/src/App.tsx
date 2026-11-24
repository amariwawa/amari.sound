import { useMemo, useState, type ReactNode } from 'react';
import { ASSETS, CHANNEL, INSTALL_PATHS, OS_INFO, RELEASE_DATE, VERSION, type Asset, type OS } from './releases';
import { DAWS, INSTALL_STEPS, TROUBLESHOOTING } from './guides';

const OSES: OS[] = ['mac', 'windows', 'linux'];

const isPhoneOrTablet = () =>
  /iphone|ipad|ipod|android|mobile/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS reports "Mac"

function detectOS(): OS {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const p = nav.userAgentData?.platform || navigator.platform || navigator.userAgent;
  if (/android/i.test(navigator.userAgent)) return 'linux';
  if (/mac|iphone|ipad/i.test(p)) return 'mac';
  if (/win/i.test(p)) return 'windows';
  if (/linux|x11/i.test(p)) return 'linux';
  return 'mac';
}

// ───────────────────────── primitives ─────────────────────────

const Section = ({ id, kicker, title, children }: { id: string; kicker: string; title: string; children: ReactNode }) => (
  <section id={id} className="scroll-mt-20 border-t border-white/[0.07] py-12 sm:py-16">
    <div className="mb-8">
      <div className="mb-2 text-[11px] tracking-[0.12em] text-white/40">
        <span className="text-white/20">// </span>
        {kicker}
      </div>
      <h2 className="text-[24px] font-bold tracking-[-0.04em] text-white sm:text-[28px]">{title}</h2>
    </div>
    {children}
  </section>
);

function OsTabs({ os, setOs, detected }: { os: OS; setOs: (o: OS) => void; detected: OS }) {
  return (
    <div className="inline-grid grid-cols-3 gap-px overflow-hidden rounded-[6px] border border-white/10 bg-white/10">
      {OSES.map((o) => (
        <button
          key={o}
          onClick={() => setOs(o)}
          className={`px-3 py-2.5 text-[12px] transition-colors sm:px-5 sm:text-[13px] ${os === o ? 'bg-white font-bold text-black' : 'bg-ash-900 text-white/60 hover:text-white'}`}
        >
          {OS_INFO[o].name}
          {o === detected && <span className={`ml-2 hidden text-[9px] sm:inline ${os === o ? 'text-black/50' : 'text-white/35'}`}>your os</span>}
        </button>
      ))}
    </div>
  );
}

function CopyPath({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 1200);
        } catch {
          /* clipboard blocked */
        }
      }}
      className="group flex w-full items-center justify-between gap-3 rounded-[4px] border border-white/[0.08] bg-black/25 px-3 py-2 text-left hover:border-white/25"
      title="Copy path"
    >
      <code className="min-w-0 truncate text-[11px] text-white/85 sm:text-[12px]">{text}</code>
      <span className="shrink-0 text-[10px] text-white/35 group-hover:text-white/70">{ok ? 'copied ✓' : 'copy'}</span>
    </button>
  );
}

const Steps = ({ steps }: { steps: string[] }) => (
  <ol className="space-y-2.5">
    {steps.map((s, i) => (
      <li key={i} className="flex gap-3 text-[13px] leading-relaxed text-white/75">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/20 text-[11px] font-bold text-white">{i + 1}</span>
        <span className="pt-0.5">{s}</span>
      </li>
    ))}
  </ol>
);

// ───────────────────────── sections ─────────────────────────

function Nav() {
  return (
    <nav className="sticky top-0 z-30 border-b border-white/[0.07] bg-ash-950/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1080px] items-center gap-4 px-4 sm:gap-8 sm:px-6">
        <a href="#top" className="shrink-0 text-[17px] font-bold sm:text-[19px] tracking-[-0.06em] text-white [text-shadow:0_0_18px_rgba(255,255,255,0.3)]">
          amarisound
        </a>
        <div className="flex gap-4 text-[12px] text-white/55 sm:gap-6">
          <a href="#download" className="hover:text-white">download</a>
          <a href="#install" className="hidden hover:text-white sm:inline">install</a>
          <a href="#daw" className="hidden hover:text-white sm:inline">in your daw</a>
          <a href="#help" className="hidden hover:text-white sm:inline">help</a>
        </div>
        <a href="/app/" className="ml-auto rounded-[4px] bg-white px-3 py-1.5 text-[12px] font-bold text-black hover:shadow-[0_0_20px_rgba(255,255,255,0.35)]">
          open web app →
        </a>
        <span className="hidden rounded-[3px] border border-white/15 px-2 py-0.5 text-[10px] text-white/50 sm:inline">
          v{VERSION} {CHANNEL}
        </span>
      </div>
    </nav>
  );
}

function Hero({ os, phone }: { os: OS; phone: boolean }) {
  const primary = ASSETS.find((a) => a.os === os && a.kind === 'installer') ?? ASSETS.find((a) => a.os === os)!;
  return (
    <header id="top" className="py-12 sm:py-20">
      <div className="mb-5 break-words text-[11px] text-white/40 sm:text-[12px]">
        <span className="text-white/25">$</span> amari analyze vocal_chop.wav <span className="text-white/25">→</span>{' '}
        <span className="text-white">E minor · 9A · 93 bpm</span>
        <span className="cursor ml-1 inline-block h-[13px] w-[7px] translate-y-[2px] bg-white/80" />
      </div>
      <h1 className="max-w-[760px] text-[38px] font-bold leading-[1.04] tracking-[-0.06em] text-white sm:text-[56px]">
        know any sample in <span className="[text-shadow:0_0_30px_rgba(255,255,255,0.35)]">one drop.</span>
      </h1>
      <p className="mt-5 max-w-[620px] text-[15px] leading-relaxed text-white/55">
        Drop or record a sample and get its BPM, key, Camelot code, scale, the chords that fit and the keys that mix with it. Flip it
        with halftime and reverse, split it into stems with AI — right inside your DAW.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        {phone && (
          <a
            href="/app/"
            className="w-full rounded-[6px] bg-white px-6 py-3.5 text-center text-[14px] font-bold text-black sm:w-auto"
          >
            open the web app →
          </a>
        )}
        <a
          href="#download"
          className={`rounded-[6px] px-6 py-3.5 text-center text-[14px] font-bold transition-shadow ${
            phone ? 'w-full border border-white/25 text-white sm:w-auto' : 'bg-white text-black hover:shadow-[0_0_32px_rgba(255,255,255,0.35)]'
          }`}
        >
          {phone ? '↓ get the plugin for your computer' : `↓ download for ${OS_INFO[os].name}`}
        </a>
        {!phone && (
          <a href="/app/" className="rounded-[6px] border border-white/20 px-5 py-3.5 text-[13px] text-white/75 hover:border-white/50 hover:text-white">
            try it in the browser
          </a>
        )}
        <span className="w-full text-[11px] text-white/35 sm:w-auto">
          {phone ? 'plugins run on macOS, Windows & Linux — on phones and tablets use the web app' : `${primary.formats.join(' · ')} · free ${CHANNEL}`}
        </span>
      </div>
      <div className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-white/[0.08] bg-white/[0.08] md:grid-cols-4">
        {[
          ['bpm', 'tempo + half/double, exact loop length'],
          ['key', 'key, camelot, scale & chords that fit'],
          ['mix', '6 compatible keys in plain language'],
          ['flip', 'halftime · reverse · ai stem splitter'],
        ].map(([k, v]) => (
          <div key={k} className="bg-ash-900 p-5">
            <div className="text-[20px] font-bold tracking-[-0.04em] text-white">{k}</div>
            <div className="mt-1 text-[11px] leading-relaxed text-white/45">{v}</div>
          </div>
        ))}
      </div>
    </header>
  );
}

function AssetRow({ a }: { a: Asset }) {
  return (
    <div className="flex flex-col gap-4 rounded-[6px] border border-white/[0.08] bg-ash-950/60 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-bold text-white">{a.label}</span>
          {a.kind === 'installer' && <span className="rounded-[3px] bg-white/15 px-1.5 text-[9px] text-white">recommended</span>}
        </div>
        <div className="mt-1 break-all text-[11px] text-white/40 sm:truncate sm:break-normal">
          {a.file}
          {a.size && ` · ${a.size}`}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {a.formats.map((f) => (
            <span key={f} className="rounded-[3px] border border-white/15 px-1.5 py-0.5 text-[10px] text-white/70">
              {f}
            </span>
          ))}
        </div>
        {a.sha256 && <div className="mt-2 truncate text-[9px] text-white/25">sha256 {a.sha256}</div>}
      </div>
      {a.available ? (
        <a
          href={a.url}
          download
          className="shrink-0 rounded-[5px] bg-white px-5 py-3 text-center text-[13px] font-bold text-black hover:shadow-[0_0_24px_rgba(255,255,255,0.35)]"
        >
          ↓ download
        </a>
      ) : (
        <span className="shrink-0 rounded-[5px] border border-dashed border-white/20 px-4 py-3 text-center text-[11px] text-white/40" title="This build hasn't been published yet">
          build pending
        </span>
      )}
    </div>
  );
}

function Download({ os, setOs, detected }: { os: OS; setOs: (o: OS) => void; detected: OS }) {
  const info = OS_INFO[os];
  return (
    <Section id="download" kicker={`download · v${VERSION} · ${RELEASE_DATE}`} title="Get amarisound">
      <OsTabs os={os} setOs={setOs} detected={detected} />
      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          {ASSETS.filter((a) => a.os === os).map((a) => (
            <AssetRow key={a.file} a={a} />
          ))}
        </div>
        <aside className="rounded-[6px] border border-white/[0.08] bg-ash-900/60 p-5">
          <div className="text-[16px] font-bold text-white">{info.name}</div>
          <div className="mt-0.5 text-[11px] text-white/45">{info.arch}</div>
          <div className="mt-4 mb-2 text-[10px] tracking-[0.1em] text-white/35">requirements</div>
          <ul className="space-y-1.5 text-[12px] leading-relaxed text-white/65">
            {info.requires.map((r) => (
              <li key={r}>· {r}</li>
            ))}
          </ul>
        </aside>
      </div>

      <div className="mt-10 overflow-x-auto rounded-[6px] border border-white/[0.08]">
        <table className="w-full min-w-[560px] text-left text-[12px]">
          <thead className="bg-ash-900 text-[10px] tracking-[0.08em] text-white/40">
            <tr>
              <th className="px-4 py-2.5 font-normal">format</th>
              <th className="px-4 py-2.5 font-normal">use it in</th>
              <th className="px-4 py-2.5 font-normal">mac</th>
              <th className="px-4 py-2.5 font-normal">windows</th>
              <th className="px-4 py-2.5 font-normal">linux</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06] text-white/70">
            {[
              ['VST3', 'FL Studio, Ableton Live, Bitwig, REAPER, Studio One, Cubase', '✓', '✓', '✓'],
              ['AU', 'Logic Pro, GarageBand (and Ableton / REAPER on Mac)', '✓', '—', '—'],
              ['Standalone', 'no DAW needed — its own app', '✓', '✓', '✓'],
              ['AAX', 'Pro Tools', 'later', 'later', '—'],
            ].map(([f, d, ...c]) => (
              <tr key={f} className="bg-ash-950/40">
                <td className="px-4 py-3 font-bold text-white">{f}</td>
                <td className="px-4 py-3 text-white/55">{d}</td>
                {c.map((x, i) => (
                  <td key={i} className={`px-4 py-3 ${x === '✓' ? 'text-white' : 'text-white/30'}`}>
                    {x}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Install({ os, setOs, detected }: { os: OS; setOs: (o: OS) => void; detected: OS }) {
  const steps = INSTALL_STEPS[os];
  return (
    <Section id="install" kicker="install" title={`Install on ${OS_INFO[os].name}`}>
      <OsTabs os={os} setOs={setOs} detected={detected} />
      <div className={`mt-6 grid gap-6 ${steps.installer.length ? 'md:grid-cols-2' : ''}`}>
        {steps.installer.length > 0 && (
          <div className="rounded-[6px] border border-white/[0.08] bg-ash-900/50 p-6">
            <div className="mb-4 text-[14px] font-bold text-white">
              with the installer <span className="ml-1 text-[10px] font-normal text-white/40">recommended</span>
            </div>
            <Steps steps={steps.installer} />
          </div>
        )}
        <div className="rounded-[6px] border border-white/[0.08] bg-ash-900/50 p-6">
          <div className="mb-4 text-[14px] font-bold text-white">{os === 'linux' ? 'install' : 'manually (zip)'}</div>
          <Steps steps={steps.manual} />
        </div>
      </div>
      <div className="mt-6">
        <div className="mb-2 text-[10px] tracking-[0.1em] text-white/35">where the files go</div>
        <div className="grid gap-2">
          {INSTALL_PATHS[os].map((p) => (
            <div key={p.what} className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[110px_1fr] sm:gap-3">
              <span className="text-[12px] text-white/50">{p.what}</span>
              <CopyPath text={p.path} />
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function Daw({ os }: { os: OS }) {
  const [id, setId] = useState(() => (os === 'mac' ? 'logic' : 'fl'));
  const daw = DAWS.find((d) => d.id === id)!;
  return (
    <Section id="daw" kicker="find it in your daw" title="Load amarisound in your DAW">
      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        <div className="grid grid-cols-2 content-start gap-1.5 md:grid-cols-1">
          {DAWS.map((d) => {
            const here = d.os.includes(os);
            return (
              <button
                key={d.id}
                onClick={() => setId(d.id)}
                className={`flex items-center justify-between rounded-[5px] border px-3.5 py-2.5 text-left text-[13px] transition-colors ${
                  d.id === id ? 'border-white bg-white/10 font-bold text-white' : 'border-white/[0.08] text-white/65 hover:border-white/30 hover:text-white'
                } ${here ? '' : 'opacity-45'}`}
                title={here ? '' : `Not available on ${OS_INFO[os].name}`}
              >
                {d.name}
                <span className="text-[9px] font-normal text-white/35">{d.format}</span>
              </button>
            );
          })}
        </div>
        <div className="rounded-[6px] border border-white/[0.08] bg-ash-900/50 p-6">
          <div className="mb-1 flex items-baseline gap-3">
            <span className="text-[20px] font-bold tracking-[-0.03em] text-white">{daw.name}</span>
            <span className="text-[11px] text-white/40">
              {daw.format} · {daw.os.map((o) => OS_INFO[o].name).join(' / ')}
            </span>
          </div>
          {!daw.os.includes(os) && <div className="mb-3 text-[11px] text-white/45">not available on {OS_INFO[os].name}</div>}
          {daw.unsupported ? (
            <p className="mt-4 text-[13px] leading-relaxed text-white/60">{daw.unsupported}</p>
          ) : (
            <div className="mt-5">
              <Steps steps={daw.steps} />
              {daw.tip && <p className="mt-5 border-l-2 border-white/30 pl-3 text-[12px] leading-relaxed text-white/50">{daw.tip}</p>}
            </div>
          )}
          <div className="mt-6 border-t border-white/[0.07] pt-4 text-[11px] leading-relaxed text-white/40">
            amarisound is an <span className="text-white/70">audio effect</span> — put it on any audio track or mixer insert. You can also drag a
            sample straight onto its window, and drag the renamed result (key + BPM in the file name) back into your project.
          </div>
        </div>
      </div>
    </Section>
  );
}

function Help({ os }: { os: OS }) {
  const items = TROUBLESHOOTING.filter((t) => !t.os || t.os === os);
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Section id="help" kicker="troubleshooting" title="Help">
      <div className="divide-y divide-white/[0.07] overflow-hidden rounded-[6px] border border-white/[0.08]">
        {items.map((t, i) => (
          <div key={t.q} className="bg-ash-950/40">
            <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between px-5 py-4 text-left text-[13px] text-white hover:bg-white/[0.02]">
              {t.q}
              <span className="text-white/40">{open === i ? '−' : '+'}</span>
            </button>
            {open === i && <p className="px-5 pb-5 text-[12px] leading-relaxed text-white/55">{t.a}</p>}
          </div>
        ))}
      </div>
    </Section>
  );
}

export default function App() {
  const detected = useMemo(detectOS, []);
  const phone = useMemo(isPhoneOrTablet, []);
  const [os, setOs] = useState<OS>(detected);
  return (
    <div className="dots min-h-full">
      <Nav />
      <main className="mx-auto max-w-[1080px] px-4 sm:px-6">
        <Hero os={os} phone={phone} />
        <Download os={os} setOs={setOs} detected={detected} />
        <Install os={os} setOs={setOs} detected={detected} />
        <Daw os={os} />
        <Help os={os} />
      </main>
      <footer className="border-t border-white/[0.07] py-8 text-center text-[11px] text-white/30">
        amarisound v{VERSION} {CHANNEL} · VST3 · AU · Standalone · macOS / Windows / Linux
      </footer>
    </div>
  );
}
