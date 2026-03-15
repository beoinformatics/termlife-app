#!/bin/bash
# Patch Electron.app's Info.plist to show "TermLife" in macOS menu bar during development
PLIST="node_modules/electron/dist/Electron.app/Contents/Info.plist"
if [ -f "$PLIST" ]; then
  /usr/libexec/PlistBuddy -c "Set :CFBundleName TermLife" "$PLIST" 2>/dev/null
  /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName TermLife" "$PLIST" 2>/dev/null
  echo "Patched Electron.app menu bar name to TermLife"
fi
