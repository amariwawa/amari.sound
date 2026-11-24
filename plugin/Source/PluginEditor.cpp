#include "PluginEditor.h"
#include "BinaryData.h"

namespace
{
juce::String mimeFor (const juce::String& path)
{
    const auto ext = path.fromLastOccurrenceOf (".", false, false).toLowerCase();
    if (ext == "html") return "text/html";
    if (ext == "js" || ext == "mjs") return "text/javascript";
    if (ext == "css") return "text/css";
    if (ext == "json") return "application/json";
    if (ext == "woff2") return "font/woff2";
    if (ext == "woff") return "font/woff";
    if (ext == "svg") return "image/svg+xml";
    if (ext == "png") return "image/png";
    if (ext == "wasm") return "application/wasm";
    return "application/octet-stream";
}

/** Opt-in diagnostics: AMARI_LOG=1 writes to <temp>/amarisound.log */
void diag (const juce::String& line)
{
    static const bool on = juce::SystemStats::getEnvironmentVariable ("AMARI_LOG", {}) == "1";
    if (on)
        juce::File::getSpecialLocation (juce::File::tempDirectory)
            .getChildFile ("amarisound.log")
            .appendText (juce::Time::getCurrentTime().toString (false, true, true, true) + "  " + line + "\n");
}

juce::File exportDir()
{
    auto dir = juce::File::getSpecialLocation (juce::File::userMusicDirectory).getChildFile ("amarisound");
    dir.createDirectory();
    return dir;
}
} // namespace

AmariEditor::AmariEditor (AmariProcessor& p)
    : AudioProcessorEditor (p),
      uiZip (std::make_unique<juce::ZipFile> (new juce::MemoryInputStream (BinaryData::ui_zip, BinaryData::ui_zipSize, false), true)),
      browser (makeOptions())
{
    addAndMakeVisible (browser);
    setResizable (true, true);
    setResizeLimits (360, 480, 2400, 1800);
    setSize (940, 600);
    browser.goToURL (juce::WebBrowserComponent::getResourceProviderRoot());
}

void AmariEditor::resized()
{
    browser.setBounds (getLocalBounds());
}

juce::WebBrowserComponent::Options AmariEditor::makeOptions()
{
    using Options = juce::WebBrowserComponent::Options;
    return Options{}
        .withBackend (Options::Backend::webview2)
        .withWinWebView2Options (Options::WinWebView2{}.withUserDataFolder (
            juce::File::getSpecialLocation (juce::File::tempDirectory).getChildFile ("amarisound-webview2")))
        .withNativeIntegrationEnabled()
        .withKeepPageLoadedWhenBrowserIsHidden()
        .withResourceProvider ([this] (const auto& url) { return getResource (url); })
        .withNativeFunction ("saveFile",
                             [] (const juce::Array<juce::var>& args, auto complete)
                             {
                                 const auto name = juce::File::createLegalFileName (args[0].toString());
                                 juce::MemoryOutputStream decoded;
                                 if (name.isEmpty() || ! juce::Base64::convertFromBase64 (decoded, args[1].toString()))
                                     return complete (juce::var());
                                 auto file = exportDir().getChildFile (name);
                                 complete (file.replaceWithData (decoded.getData(), decoded.getDataSize())
                                               ? juce::var (file.getFullPathName())
                                               : juce::var());
                             })
        .withNativeFunction ("dragFile",
                             [this] (const juce::Array<juce::var>& args, auto complete)
                             {
                                 const juce::File file (args[0].toString());
                                 complete (file.existsAsFile()
                                           && juce::DragAndDropContainer::performExternalDragDropOfFiles ({ file.getFullPathName() }, false, this));
                             })
        .withNativeFunction ("revealFile",
                             [] (const juce::Array<juce::var>& args, auto complete)
                             {
                                 juce::File (args[0].toString()).revealToUser();
                                 complete (true);
                             })
        .withNativeFunction ("log",
                             [] (const juce::Array<juce::var>& args, auto complete)
                             {
                                 diag ("[ui] " + args[0].toString());
                                 complete (true);
                             })
        .withNativeFunction ("selfTestFile",
                             [] (const juce::Array<juce::var>&, auto complete)
                             {
                                 // diagnostics only: AMARI_SELFTEST_FILE=/path/to.wav makes the UI load + play it
                                 const juce::File f (juce::SystemStats::getEnvironmentVariable ("AMARI_SELFTEST_FILE", {}));
                                 juce::MemoryBlock mb;
                                 if (f.existsAsFile() && f.loadFileAsData (mb))
                                     return complete (juce::Base64::toBase64 (mb.getData(), mb.getSize()));
                                 complete (juce::var());
                             })
        .withNativeFunction ("hostInfo",
                             [] (const juce::Array<juce::var>&, auto complete)
                             {
                                 auto* o = new juce::DynamicObject();
                                 o->setProperty ("version", AMARI_VERSION);
                                 o->setProperty ("exportDir", exportDir().getFullPathName());
                                 complete (juce::var (o));
                             });
}

std::optional<juce::WebBrowserComponent::Resource> AmariEditor::getResource (const juce::String& url)
{
    auto path = url.upToFirstOccurrenceOf ("?", false, false).upToFirstOccurrenceOf ("#", false, false);
    path = juce::URL::removeEscapeChars (path).trimCharactersAtStart ("/");
    if (path.isEmpty())
        path = "index.html";

    const auto* entry = uiZip->getEntry (path);
    diag ("resource " + path + (entry != nullptr ? "" : "  (404)"));
    if (entry == nullptr)
        return std::nullopt;

    std::unique_ptr<juce::InputStream> in (uiZip->createStreamForEntry (*entry));
    if (in == nullptr)
        return std::nullopt;

    juce::WebBrowserComponent::Resource r;
    r.mimeType = mimeFor (path);
    r.data.resize ((size_t) entry->uncompressedSize);
    in->read (r.data.data(), (int) r.data.size());
    return r;
}
