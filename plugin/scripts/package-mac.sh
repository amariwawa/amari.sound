#!/bin/bash
# Package the macOS build: amarisound-macOS.pkg (choose VST3 / AU / app) + amarisound-macOS.zip
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(grep -E '^project\(' CMakeLists.txt | sed -E 's/.*VERSION ([0-9.]+).*/\1/')
ART=build/amarisound_artefacts/Release
OUT=dist; WORK=build/pkg
rm -rf "$WORK" && mkdir -p "$WORK"/{vst3,au,app} "$OUT"

cp -R "$ART/VST3/amarisound.vst3" "$WORK/vst3/"
cp -R "$ART/AU/amarisound.component" "$WORK/au/"
cp -R "$ART/Standalone/amarisound.app" "$WORK/app/"
for b in "$WORK"/vst3/*.vst3 "$WORK"/au/*.component "$WORK"/app/*.app; do
  codesign --force --deep --sign - "$b"   # ad-hoc signature (required for Apple Silicon)
done

component() { # name root install-location
  pkgbuild --analyze --root "$WORK/$2" "$WORK/$1.plist" >/dev/null
  /usr/libexec/PlistBuddy -c "Set :0:BundleIsRelocatable false" "$WORK/$1.plist" 2>/dev/null || true
  pkgbuild --root "$WORK/$2" --component-plist "$WORK/$1.plist" --install-location "$3" \
           --identifier "com.amarisound.pkg.$1" --version "$VERSION" "$WORK/$1.pkg" >/dev/null
}
component vst3 vst3 "/Library/Audio/Plug-Ins/VST3"
component au   au   "/Library/Audio/Plug-Ins/Components"
component app  app  "/Applications"

cat > "$WORK/distribution.xml" <<XML
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
  <title>amarisound $VERSION</title>
  <options customize="allow" require-scripts="false" hostArchitectures="arm64,x86_64"/>
  <os-version min="11.0"/>
  <choices-outline>
    <line choice="vst3"/><line choice="au"/><line choice="app"/>
  </choices-outline>
  <choice id="vst3" title="VST3 plug-in" description="For FL Studio, Ableton Live, Bitwig, REAPER, Studio One, Cubase."><pkg-ref id="com.amarisound.pkg.vst3"/></choice>
  <choice id="au" title="Audio Unit plug-in" description="For Logic Pro, GarageBand (and Ableton / REAPER)."><pkg-ref id="com.amarisound.pkg.au"/></choice>
  <choice id="app" title="Standalone app" description="amarisound without a DAW, in /Applications."><pkg-ref id="com.amarisound.pkg.app"/></choice>
  <pkg-ref id="com.amarisound.pkg.vst3" version="$VERSION">vst3.pkg</pkg-ref>
  <pkg-ref id="com.amarisound.pkg.au" version="$VERSION">au.pkg</pkg-ref>
  <pkg-ref id="com.amarisound.pkg.app" version="$VERSION">app.pkg</pkg-ref>
</installer-gui-script>
XML
productbuild --distribution "$WORK/distribution.xml" --package-path "$WORK" "$OUT/amarisound-macOS.pkg" >/dev/null

# manual-install zip (README inside)
mkdir -p "$WORK/zip/amarisound"
cp -R "$WORK"/vst3/*.vst3 "$WORK"/au/*.component "$WORK"/app/*.app "$WORK/zip/amarisound/"
cat > "$WORK/zip/amarisound/README.txt" <<TXT
amarisound $VERSION — manual install (macOS)

VST3  -> /Library/Audio/Plug-Ins/VST3/
AU    -> /Library/Audio/Plug-Ins/Components/
App   -> /Applications/

Because these files were downloaded, macOS may block them. After copying, run in Terminal:
  xattr -dr com.apple.quarantine /Library/Audio/Plug-Ins/VST3/amarisound.vst3 \
    /Library/Audio/Plug-Ins/Components/amarisound.component /Applications/amarisound.app
Then restart your DAW. (The .pkg installer does all of this for you.)
TXT
(cd "$WORK/zip" && ditto -c -k --sequesterRsrc --keepParent amarisound "../../../$OUT/amarisound-macOS.zip")
ls -la "$OUT"
