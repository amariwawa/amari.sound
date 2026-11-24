; Inno Setup script — builds amarisound-Windows-x64-Setup.exe (VST3 + standalone app)
#define AppVersion GetEnv("AMARI_VERSION")

[Setup]
AppId={{6F1E2B6A-7C1D-4B7E-9A3F-AMARISOUND01}
AppName=amarisound
AppVersion={#AppVersion}
AppPublisher=amarisound
AppPublisherURL=https://amarisound.vercel.app
DefaultDirName={autopf}\amarisound
DisableProgramGroupPage=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist
OutputBaseFilename=amarisound-Windows-x64-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin

[Types]
Name: "full"; Description: "VST3 plug-in + standalone app"
Name: "custom"; Description: "Choose"; Flags: iscustom

[Components]
Name: "vst3"; Description: "VST3 plug-in (C:\Program Files\Common Files\VST3)"; Types: full custom
Name: "app"; Description: "Standalone app"; Types: full custom

[Files]
Source: "..\build\amarisound_artefacts\Release\VST3\amarisound.vst3\*"; DestDir: "{commoncf64}\VST3\amarisound.vst3"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: vst3
Source: "..\build\amarisound_artefacts\Release\Standalone\amarisound.exe"; DestDir: "{app}"; Flags: ignoreversion; Components: app

[Icons]
Name: "{autoprograms}\amarisound"; Filename: "{app}\amarisound.exe"; Components: app

[Run]
Filename: "{app}\amarisound.exe"; Description: "Open amarisound"; Flags: nowait postinstall skipifsilent; Components: app
