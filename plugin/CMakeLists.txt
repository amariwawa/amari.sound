cmake_minimum_required(VERSION 3.22)

set(CMAKE_OSX_DEPLOYMENT_TARGET "11.0" CACHE STRING "Minimum macOS version")
project(amarisound VERSION 0.2.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# JUCE 8 — vendored by scripts (plugin/.deps/JUCE) or passed with -DJUCE_DIR=...
set(JUCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/.deps/JUCE" CACHE PATH "Path to JUCE 8")
add_subdirectory("${JUCE_DIR}" JUCE)

# The web UI (ui/ built with `npm run build:plugin`, zipped) is compiled into the plugin.
set(AMARI_UI_ZIP "${CMAKE_CURRENT_SOURCE_DIR}/build-ui/ui.zip" CACHE FILEPATH "Zipped plugin UI")
if(NOT EXISTS "${AMARI_UI_ZIP}")
  message(FATAL_ERROR "UI bundle not found: ${AMARI_UI_ZIP} — run scripts/build-ui.sh (or .ps1) first")
endif()
juce_add_binary_data(amarisound_ui SOURCES "${AMARI_UI_ZIP}")

if(APPLE)
  set(AMARI_FORMATS VST3 AU Standalone)
else()
  set(AMARI_FORMATS VST3 Standalone)
endif()

juce_add_plugin(amarisound
  PRODUCT_NAME "amarisound"
  COMPANY_NAME "amarisound"
  COMPANY_WEBSITE "https://amarisound.vercel.app"
  BUNDLE_ID "com.amarisound.amarisound"
  PLUGIN_MANUFACTURER_CODE Amrs
  PLUGIN_CODE Amr1
  FORMATS ${AMARI_FORMATS}
  DESCRIPTION "Sample analyzer: BPM, key, Camelot, compatible keys, halftime, reverse, AI stems"
  IS_SYNTH FALSE
  NEEDS_MIDI_INPUT FALSE
  NEEDS_MIDI_OUTPUT FALSE
  IS_MIDI_EFFECT FALSE
  EDITOR_WANTS_KEYBOARD_FOCUS TRUE
  COPY_PLUGIN_AFTER_BUILD FALSE
  VST3_CATEGORIES Fx Analyzer
  AU_MAIN_TYPE kAudioUnitType_Effect
  NEEDS_WEB_BROWSER TRUE
  NEEDS_WEBVIEW2 TRUE
  MICROPHONE_PERMISSION_ENABLED TRUE
  MICROPHONE_PERMISSION_TEXT "amarisound records samples from your microphone to detect their BPM and key."
  HARDENED_RUNTIME_ENABLED FALSE)

target_sources(amarisound PRIVATE Source/PluginProcessor.cpp Source/PluginEditor.cpp)

target_compile_definitions(amarisound PUBLIC
  JUCE_WEB_BROWSER=1
  JUCE_USE_CURL=0
  JUCE_VST3_CAN_REPLACE_VST2=0
  JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1
  JUCE_DISPLAY_SPLASH_SCREEN=0
  AMARI_VERSION="${PROJECT_VERSION}")

target_link_libraries(amarisound
  PRIVATE amarisound_ui juce::juce_audio_utils juce::juce_gui_extra
  PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_lto_flags juce::juce_recommended_warning_flags)
