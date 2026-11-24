#pragma once
#include <juce_gui_extra/juce_gui_extra.h>
#include "PluginProcessor.h"

/**
    The editor is the amarisound web app (ui/), compiled into the plugin and served to a native
    web view (WKWebView / WebView2 / WebKitGTK) through a resource provider — no internet needed
    except for the AI stem splitter, which calls the hosted API.

    Native functions exposed to the page (window.__JUCE__):
      saveFile(name, base64)  -> absolute path   (writes to ~/Music/amarisound/)
      dragFile(path)          -> bool            (native file drag into the DAW / Finder)
      revealFile(path)                           (shows the file in Finder / Explorer)
*/
class AmariEditor final : public juce::AudioProcessorEditor,
                          public juce::DragAndDropContainer
{
public:
    explicit AmariEditor (AmariProcessor&);
    void resized() override;

private:
    std::optional<juce::WebBrowserComponent::Resource> getResource (const juce::String& url);
    juce::WebBrowserComponent::Options makeOptions();

    std::unique_ptr<juce::ZipFile> uiZip;
    juce::WebBrowserComponent browser;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (AmariEditor)
};
