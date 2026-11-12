#!/bin/zsh
# Archive the iPhone app (with the widget), or the Apple TV app, and upload it to TestFlight.
#
#   ios/testflight.sh                         iPhone: archive + upload
#   ios/testflight.sh tv                      Apple TV: archive + upload (same app record, tvOS platform)
#   ios/testflight.sh setup <AuthKey.p8> <issuer-id>   one-time: install an App Store Connect API key
#
# With an API key installed, uploads don't depend on Xcode's Apple ID sign-in. Without one, it falls
# back to whatever account Xcode has. The key never goes in the repo: it lives in
# ~/.appstoreconnect/private_keys (Apple's standard spot) with its IDs in ~/.appstoreconnect/diastole.env.
set -euo pipefail

ASC_DIR="$HOME/.appstoreconnect"
ENV_FILE="$ASC_DIR/diastole.env"
HERE="${0:A:h}"

if [[ "${1:-}" == "setup" ]]; then
  key="${2:?Usage: ios/testflight.sh setup <path to AuthKey_XXXX.p8> <issuer id>}"
  issuer="${3:?Usage: ios/testflight.sh setup <path to AuthKey_XXXX.p8> <issuer id>}"
  [[ -f "$key" ]] || { echo "No file at $key. Use the real name, e.g. ~/Downloads/AuthKey_AB12CD34EF.p8"; exit 1; }
  name="${key:t}"
  [[ "$name" == AuthKey_*.p8 ]] || { echo "Expected a file named AuthKey_<KEY ID>.p8"; exit 1; }
  [[ "$issuer" =~ '^[0-9a-f-]{36}$' ]] || { echo "The issuer ID looks like 69a6de70-xxxx-xxxx-xxxx-xxxxxxxxxxxx"; exit 1; }
  kid="${${name#AuthKey_}%.p8}"
  mkdir -p "$ASC_DIR/private_keys" && chmod 700 "$ASC_DIR" "$ASC_DIR/private_keys"
  mv "$key" "$ASC_DIR/private_keys/$name" || { echo "Couldn't move the key."; exit 1; }
  chmod 600 "$ASC_DIR/private_keys/$name"
  printf 'ASC_KEY_ID=%s\nASC_ISSUER_ID=%s\n' "$kid" "$issuer" > "$ENV_FILE" && chmod 600 "$ENV_FILE"
  echo "Installed key $kid. Uploads no longer need Xcode's sign-in."
  exit 0
fi

AUTH=()
if [[ -f "$ENV_FILE" ]]; then
  source "$ENV_FILE"
  AUTH=(-authenticationKeyPath "$ASC_DIR/private_keys/AuthKey_${ASC_KEY_ID}.p8" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
  echo "Using App Store Connect API key $ASC_KEY_ID"
else
  echo "No API key installed; using Xcode's signed-in account"
fi

SCHEME=Diastole PLATFORM=iOS SIGN=()
# No Apple TV is registered on the team, so sign the TV archive for distribution directly (an App
# Store profile needs no devices; a development profile does). The archive is left unsigned and the
# upload step signs it for the App Store.
if [[ "${1:-}" == "tv" ]]; then SCHEME=DiastoleTV PLATFORM=tvOS SIGN=(CODE_SIGNING_ALLOWED=NO); echo "Apple TV build"; fi
OUT="${TMPDIR:-/tmp}/diastole-testflight-$SCHEME"
rm -rf "$OUT" && mkdir -p "$OUT"
xcodebuild -project "$HERE/Diastole.xcodeproj" -scheme "$SCHEME" -configuration Release \
  -destination "generic/platform=$PLATFORM" -archivePath "$OUT/Diastole.xcarchive" \
  -allowProvisioningUpdates "${AUTH[@]}" "${SIGN[@]}" archive | grep -E "error:|warning: .*signing|ARCHIVE" || true
[[ -d "$OUT/Diastole.xcarchive" ]] || { echo "Archive failed"; exit 1; }
export_with() {
  rm -rf "$OUT/export"
  xcodebuild -exportArchive -archivePath "$OUT/Diastole.xcarchive" -exportOptionsPlist "$HERE/ExportOptions.plist" \
    -exportPath "$OUT/export" -allowProvisioningUpdates "$@" 2>&1 | tee "$OUT/export.log" | grep -E "error|Upload succeeded|EXPORT"
  grep -q "Upload succeeded" "$OUT/export.log"
}
if ! export_with "${AUTH[@]}"; then
  # An App Manager key can't use Apple's cloud signing certificate; Xcode's Admin sign-in can.
  if (( ${#AUTH[@]} )) && grep -q "Cloud signing permission" "$OUT/export.log"; then
    echo "The API key lacks cloud signing (needs the Admin role). Retrying with Xcode's signed-in account…"
    export_with || { echo "Upload failed. Sign in under Xcode → Settings → Accounts, or give the key the Admin role."; exit 1; }
  else
    exit 1
  fi
fi
