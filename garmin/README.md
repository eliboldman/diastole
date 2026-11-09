# Diastole for Garmin (Connect IQ)

A widget that shows today's plan, readiness and last night's numbers on the watch. It lives in the
glance loop and refreshes in the background every 30 minutes.

- Sign-in: the watch shows a 6-character code; type it at diastole.app/me/devices.
- Data: `GET /api/device/today` with the watch's bearer token (see `lib/devices/`).
- Pages (up/down): Today · Steps (one per workout) · Last night · Tomorrow. Start refreshes; the
  menu (hold Up) can sign the watch out.

## Building

1. Install the Connect IQ SDK Manager from developer.garmin.com/connect-iq/sdk, sign in with a
   Garmin account, install the latest SDK and the devices listed in `manifest.xml`.
2. Install a Java runtime (`brew install openjdk`).
3. Make a developer key once and keep it safe outside the repo. The store needs the same key for
   every future update:
   `openssl genrsa -out key.pem 4096 && openssl pkcs8 -topk8 -inform PEM -outform DER -in key.pem -out developer_key.der -nocrypt`
4. Build for a watch: `monkeyc -f monkey.jungle -d fr965 -o bin/diastole.prg -y developer_key.der`
5. Try it on a real watch: plug in over USB and copy `bin/diastole.prg` to `GARMIN/APPS/`.
6. Store build: `monkeyc -e -f monkey.jungle -o bin/diastole.iq -y developer_key.der`, then upload at
   apps.garmin.com/developer.
