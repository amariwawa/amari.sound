/**
 * Single source of truth for the download page.
 *
 * Files are published as GitHub Release assets (.github/workflows/plugin.yml on a v* tag, or
 * plugin/scripts/package-*.sh + `gh release upload`). Names are version-independent so the
 * "latest" links always point at the newest release. Set `available: true` once uploaded.
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

export const RELEASES_URL = 'https://github.com/amariwawa/amari.sound/releases/latest';
const dl = (file: string) => `${RELEASES_URL}/download/${file}`;

export const ASSETS: Asset[] = [
  {
    os: 'mac',
    kind: 'installer',
    label: 'macOS installer',
    file: 'amarisound-macOS.pkg',
    url: dl('amarisound-macOS.pkg'),
    formats: ['VST3', 'AU', 'Standalone app'],
    size: '16.4 MB',
    sha256: '11547a1da7257a5dc4c4a9387addb81b6b2be561a513ef2bccad2568b19e82ac',
    available: true,
  },
  {
    os: 'mac',
    kind: 'archive',
    label: 'macOS manual install (.zip)',
    file: 'amarisound-macOS.zip',
    url: dl('amarisound-macOS.zip'),
    formats: ['VST3', 'AU', 'Standalone app'],
    size: '16.4 MB',
    sha256: '6b1d267e3f1b5f12664bfcede134fc178989d33a8112a386a6192757a8b72582',
    available: true,
  },
  {
    os: 'windows',
    kind: 'installer',
    label: 'Windows installer',
    file: 'amarisound-Windows-x64-Setup.exe',
    url: dl('amarisound-Windows-x64-Setup.exe'),
    formats: ['VST3', 'Standalone app'],
    available: false,
  },
  {
    os: 'windows',
    kind: 'archive',
    label: 'Windows manual install (.zip)',
    file: 'amarisound-Windows-x64.zip',
    url: dl('amarisound-Windows-x64.zip'),
    formats: ['VST3', 'Standalone app'],
    available: false,
  },
  {
    os: 'linux',
    kind: 'archive',
    label: 'Linux (.tar.gz)',
    file: 'amarisound-Linux-x86_64.tar.gz',
    url: dl('amarisound-Linux-x86_64.tar.gz'),
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
