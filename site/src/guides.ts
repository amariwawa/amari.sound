import type { OS } from './releases';

/** Installing the download, per OS. */
export const INSTALL_STEPS: Record<OS, { installer: string[]; manual: string[] }> = {
  mac: {
    installer: [
      'Open amarisound-macOS.pkg. If macOS says it can’t check it: right-click the file → Open → Open (or System Settings → Privacy & Security → Open Anyway).',
      'Keep VST3, AU and Standalone ticked (untick anything you don’t want).',
      'Enter your Mac password when asked — plug-ins go into the system Plug-Ins folder.',
      'Restart your DAW (or rescan plug-ins) and amarisound shows up.',
    ],
    manual: [
      'Unzip amarisound-macOS.zip.',
      'Finder → Go → Go to Folder…, paste /Library/Audio/Plug-Ins/VST3 and drop amarisound.vst3 there.',
      'For Logic / GarageBand: drop amarisound.component into /Library/Audio/Plug-Ins/Components.',
      'Drag amarisound.app into Applications for the standalone version.',
      'Downloaded files are quarantined by macOS — in Terminal run: xattr -dr com.apple.quarantine /Library/Audio/Plug-Ins/VST3/amarisound.vst3 /Library/Audio/Plug-Ins/Components/amarisound.component /Applications/amarisound.app',
      'Restart your DAW.',
    ],
  },
  windows: {
    installer: [
      'Run amarisound-Windows-x64-Setup.exe.',
      'If SmartScreen appears: “More info” → “Run anyway”.',
      'Keep the default VST3 folder: C:\\Program Files\\Common Files\\VST3.',
      'Restart your DAW (or rescan plug-ins).',
    ],
    manual: [
      'Unzip amarisound-Windows-x64.zip.',
      'Copy amarisound.vst3 into C:\\Program Files\\Common Files\\VST3.',
      'Put the amarisound folder (standalone .exe) anywhere you like, e.g. C:\\Program Files.',
      'Restart your DAW.',
    ],
  },
  linux: {
    installer: [],
    manual: [
      'Install the web view dependency: sudo apt install libwebkit2gtk-4.1-0 (Fedora: sudo dnf install webkit2gtk4.1).',
      'tar -xzf amarisound-Linux-x86_64.tar.gz && cd amarisound',
      './install.sh  (copies the VST3 to ~/.vst3 and the app to ~/.local/bin)',
      'Rescan plug-ins in your host.',
    ],
  },
};

export interface DawGuide {
  id: string;
  name: string;
  os: OS[];
  format: string;
  steps: string[];
  tip?: string;
  unsupported?: string;
}

/** Finding and using amarisound inside each DAW. amarisound is an audio effect. */
export const DAWS: DawGuide[] = [
  {
    id: 'fl',
    name: 'FL Studio',
    os: ['mac', 'windows'],
    format: 'VST3',
    steps: [
      'Options → Manage plugins.',
      'Make sure the VST3 folder is in the search paths (it is by default).',
      'Click “Find installed plugins” (or “Find plugins”) and wait for the scan.',
      'Tick the star next to amarisound to add it to your favourites.',
      'Open the Mixer, pick a track, click an empty insert slot → Select → amarisound.',
    ],
    tip: 'Route the channel you want analysed to that mixer track — or just drag a sample straight onto the amarisound window.',
  },
  {
    id: 'ableton',
    name: 'Ableton Live',
    os: ['mac', 'windows'],
    format: 'VST3 · AU (mac)',
    steps: [
      'Settings (Preferences) → Plug-Ins.',
      'Turn on “Use VST3 Plug-In System Folders” (and “Use Audio Units v2/v3” on Mac).',
      'Click Rescan.',
      'In the browser, open Plug-Ins → amarisound.',
      'Drag it onto an audio track (or double-click with the track selected).',
    ],
  },
  {
    id: 'logic',
    name: 'Logic Pro',
    os: ['mac'],
    format: 'AU',
    steps: [
      'Open Logic — new Audio Units are validated automatically at launch.',
      'If amarisound is missing: Logic Pro → Settings → Plug-in Manager, select amarisound → “Reset & Rescan Selection”.',
      'On an audio track, click an Audio FX slot → Audio Units → amarisound → amarisound.',
    ],
  },
  {
    id: 'garageband',
    name: 'GarageBand',
    os: ['mac'],
    format: 'AU',
    steps: [
      'Select an audio track and open Smart Controls (B).',
      'Click Plug-ins → an empty slot → Audio Units → amarisound.',
    ],
  },
  {
    id: 'bitwig',
    name: 'Bitwig Studio',
    os: ['mac', 'windows', 'linux'],
    format: 'VST3',
    steps: [
      'Settings → Locations → Plug-ins: keep “Use system default locations” on.',
      'Bitwig rescans on its own; in the Browser open Devices → Plug-ins → amarisound.',
      'Drag it onto an audio track’s device chain.',
    ],
  },
  {
    id: 'reaper',
    name: 'REAPER',
    os: ['mac', 'windows', 'linux'],
    format: 'VST3 · AU (mac)',
    steps: [
      'Options → Preferences → Plug-ins → VST.',
      'Check the VST3 folder is in the path list, then “Re-scan”.',
      'Click a track’s FX button → VST3 → amarisound.',
    ],
  },
  {
    id: 'studioone',
    name: 'Studio One',
    os: ['mac', 'windows'],
    format: 'VST3 · AU (mac)',
    steps: [
      'Studio One → Options → Locations → VST Plug-ins: confirm the VST3 folder is listed.',
      'Restart Studio One (or click “Reset Blocklist” if it was blocked).',
      'Browser → Effects → amarisound, drag it onto an audio track.',
    ],
  },
  {
    id: 'cubase',
    name: 'Cubase / Nuendo',
    os: ['mac', 'windows'],
    format: 'VST3',
    steps: [
      'Studio → VST Plug-in Manager → “Update Plug-in Information” (rescan).',
      'On an audio track, open an Insert slot → amarisound.',
    ],
  },
  {
    id: 'protools',
    name: 'Pro Tools',
    os: ['mac', 'windows'],
    format: 'AAX',
    steps: [],
    unsupported: 'Pro Tools needs the AAX format, which isn’t available yet. Use the standalone app alongside Pro Tools for now.',
  },
];

export const TROUBLESHOOTING: { q: string; a: string; os?: OS }[] = [
  {
    q: 'amarisound doesn’t show up in my DAW',
    a: 'Rescan plug-ins (see your DAW above) and fully restart the DAW. Check the file is in the right folder (paths above). amarisound is 64-bit only.',
  },
  {
    q: '“amarisound can’t be opened because Apple cannot check it”',
    os: 'mac',
    a: 'This beta isn’t notarised by Apple yet. Right-click the .pkg (or the app) → Open → Open, or System Settings → Privacy & Security → scroll down → “Open Anyway”. Plug-ins installed by the .pkg work straight away.',
  },
  {
    q: 'Windows protected your PC (SmartScreen)',
    os: 'windows',
    a: 'Click “More info” → “Run anyway”. This appears for new installers until they build up reputation.',
  },
  {
    q: 'The plugin window is blank',
    a: 'The interface is a built-in web view. Windows 10 needs the Microsoft Edge WebView2 runtime (the installer adds it); Linux needs libwebkit2gtk-4.1.',
  },
  {
    q: 'Does it work on Apple Silicon?',
    os: 'mac',
    a: 'Yes — the macOS build is Universal and runs natively on M-series Macs (no Rosetta needed).',
  },
  {
    q: 'Where do exported samples and stems go?',
    a: 'In the plugin, drag “drag sample” or a stem’s “↓ wav” straight onto a track. A click saves the file to Music/amarisound and opens that folder.',
  },
  {
    q: 'Can I use it on my phone or tablet?',
    a: 'Plug-ins only run on computers. On iPhone, iPad and Android use the web app — open amarisound.vercel.app/app in Safari or Chrome. Everything works there, including stems.',
  },
  {
    q: 'How do I use it once it’s loaded?',
    a: 'Drag any sample onto the window (or record one) — it shows BPM, key, Camelot code, the scale, chords that fit and compatible keys. Use ½ time / rev to transform it, split stems, then drag the renamed result back into your project.',
  },
];
