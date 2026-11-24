/**
 * Single source of truth for the download page.
 *
 * To publish a build: put the file in site/public/downloads/ (or point `url` at your CDN /
 * GitHub release), fill in `size` + `sha256`, and set `available: true`.
 */
export type OS = 'mac' | 'windows' | 'linux';

export interface Asset {
  os: OS;
  file: string;
  url: string;
  kind: 'installer' | 'archive';
  label: string;
  /** what's inside */
  formats: string[];
  size?: string;
  sha256?: string;
  available: boolean;
}

export const VERSION = '0.2.0';
export const CHANNEL = 'beta';
export const RELEASE_DATE = 'November 2026';

const dl = (file: string) => `/downloads/${file}`;

export const ASSETS: Asset[] = [
  {
    os: 'mac',
    kind: 'installer',
    label: 'macOS installer',
    file: `amarisound-${VERSION}-macOS.pkg`,
    url: dl(`amarisound-${VERSION}-macOS.pkg`),
    formats: ['VST3', 'AU', 'Standalone app'],
    available: false,
  },
  {
    os: 'mac',
    kind: 'archive',
    label: 'macOS manual install (.zip)',
    file: `amarisound-${VERSION}-macOS.zip`,
    url: dl(`amarisound-${VERSION}-macOS.zip`),
    formats: ['VST3', 'AU', 'Standalone app'],
    available: false,
  },
  {
    os: 'windows',
    kind: 'installer',
    label: 'Windows installer',
    file: `amarisound-${VERSION}-Windows-x64-Setup.exe`,
    url: dl(`amarisound-${VERSION}-Windows-x64-Setup.exe`),
    formats: ['VST3', 'Standalone app'],
    available: false,
  },
  {
    os: 'windows',
    kind: 'archive',
    label: 'Windows manual install (.zip)',
    file: `amarisound-${VERSION}-Windows-x64.zip`,
    url: dl(`amarisound-${VERSION}-Windows-x64.zip`),
    formats: ['VST3', 'Standalone app'],
    available: false,
  },
  {
    os: 'linux',
    kind: 'archive',
    label: 'Linux (.tar.gz)',
    file: `amarisound-${VERSION}-Linux-x86_64.tar.gz`,
    url: dl(`amarisound-${VERSION}-Linux-x86_64.tar.gz`),
    formats: ['VST3', 'Standalone app'],
    available: false,
  },
];

export const OS_INFO: Record<OS, { name: string; arch: string; requires: string[] }> = {
  mac: {
    name: 'macOS',
    arch: 'Universal — Apple Silicon (M1–M4) & Intel',
    requires: ['macOS 11 Big Sur or newer', '64-bit host (any current DAW)', '~200 MB disk (+80 MB for the stem model)'],
  },
  windows: {
    name: 'Windows',
    arch: '64-bit (x64)',
    requires: ['Windows 10 or 11, 64-bit', 'Microsoft Edge WebView2 runtime (built into Windows 11; the installer adds it on 10)', '~200 MB disk (+80 MB for the stem model)'],
  },
  linux: {
    name: 'Linux',
    arch: 'x86_64 · experimental',
    requires: ['Ubuntu 22.04+ / Fedora 38+ or similar', 'libwebkit2gtk-4.1 (the plugin window uses it)', 'a VST3 host such as Bitwig, Reaper or Ardour'],
  },
};

/** Where things end up after installing. */
export const INSTALL_PATHS: Record<OS, { what: string; path: string }[]> = {
  mac: [
    { what: 'VST3', path: '/Library/Audio/Plug-Ins/VST3/amarisound.vst3' },
    { what: 'Audio Unit', path: '/Library/Audio/Plug-Ins/Components/amarisound.component' },
    { what: 'Standalone', path: '/Applications/amarisound.app' },
  ],
  windows: [
    { what: 'VST3', path: 'C:\\Program Files\\Common Files\\VST3\\amarisound.vst3' },
    { what: 'Standalone', path: 'C:\\Program Files\\amarisound\\amarisound.exe' },
  ],
  linux: [
    { what: 'VST3', path: '~/.vst3/amarisound.vst3' },
    { what: 'Standalone', path: '~/.local/bin/amarisound' },
  ],
};
