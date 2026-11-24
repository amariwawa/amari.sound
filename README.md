# amarisound

Sample analyzer for producers: drop or record a sample and get its **BPM**, **key**, **Camelot code**, **scale**, **chords that fit** and **compatible keys** — then flip it with **halftime** (HalfTime / Gross Beat style) and **reverse**, split it into **stems** with AI, and drag the renamed result back into your DAW.

| folder | what |
|---|---|
| `ui/` | the plugin interface + browser engine (Vite · React · TypeScript · Tailwind) |
| `stems-server/` | local stem splitter (Meta's Demucs `htdemucs`) on `127.0.0.1:8765` |
| `site/` | download website (per-OS files, install + DAW guides) |
| `test-samples/` | synthetic test loops with known BPM / key |

## Run it

```sh
cd ui
npm install
npm run stems:setup   # once — installs PyTorch + Demucs (~300 MB) for the stem splitter
npm run dev           # UI on http://127.0.0.1:5173 + stem server
```

Download site: `cd site && npm install && npm run dev` → http://127.0.0.1:5174

## How the analysis works

- **BPM** — onset-strength envelope (log spectral flux) → autocorrelation with harmonic comb + tempo prior; exact-loop snapping from sample length; half/double alternatives.
- **Key** — spectral-peak chroma with tuning compensation → Krumhansl–Kessler profiles over 24 keys; relative major/minor resolved from the bass line; refined with notes transcribed by Spotify's Basic Pitch neural network.
- **Halftime** — tempo-synced loops (¼–2 bars) aligned to the downbeat; the first half of each loop plays at half speed (octave down, same key), length and BPM unchanged, crossfaded restarts.
- **Stems** — Demucs `htdemucs` → vocals / drums / bass / other, running locally (Apple GPU via Metal when available).

## Roadmap

JUCE 8 plugin (VST3 / AU / Standalone) embedding this UI, C++ port of the analysis, CI builds for macOS / Windows / Linux, and in-plugin stem separation.
