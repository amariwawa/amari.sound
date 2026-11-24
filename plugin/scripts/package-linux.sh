#!/bin/bash
# Package the Linux build: amarisound-Linux-x86_64.tar.gz (VST3 + standalone + install.sh)
set -euo pipefail
cd "$(dirname "$0")/.."
ART=build/amarisound_artefacts/Release
STAGE=build/linux/amarisound; OUT=dist
rm -rf build/linux && mkdir -p "$STAGE" "$OUT"
cp -R "$ART/VST3/amarisound.vst3" "$STAGE/"
cp "$ART/Standalone/amarisound" "$STAGE/"
cat > "$STAGE/install.sh" <<'SH'
#!/bin/sh
# Installs amarisound for the current user (VST3 -> ~/.vst3, app -> ~/.local/bin)
set -e
cd "$(dirname "$0")"
mkdir -p "$HOME/.vst3" "$HOME/.local/bin"
rm -rf "$HOME/.vst3/amarisound.vst3"
cp -R amarisound.vst3 "$HOME/.vst3/"
cp amarisound "$HOME/.local/bin/" && chmod +x "$HOME/.local/bin/amarisound"
echo "installed: ~/.vst3/amarisound.vst3 and ~/.local/bin/amarisound"
echo "needs: libwebkit2gtk-4.1 (Ubuntu: sudo apt install libwebkit2gtk-4.1-0)"
SH
chmod +x "$STAGE/install.sh" "$STAGE/amarisound"
tar -C build/linux -czf "$OUT/amarisound-Linux-x86_64.tar.gz" amarisound
ls -la "$OUT"
