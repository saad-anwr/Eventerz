/**
 * Android App Links verification.
 *
 * # What this is for
 *
 * Ticket QR codes now encode `https://eventerz.xyz/checkin?ticket=..&secret=..`
 * so that *any* camera can read them - the old `eventerz:v1:checkin?...` payload
 * was understood by nothing except the app itself, and pointing a phone camera
 * at a ticket reported "No usable data found".
 *
 * The app declares an intent filter for that path with `autoVerify: true`
 * (`app.json`). Android only honours it if it can fetch this file from the
 * domain and find the app's signing certificate listed here. That is the whole
 * point of the mechanism: it stops any app on the device claiming to be
 * eventerz.xyz.
 *
 * # What happens when it is not configured
 *
 * Verification fails and the link opens in the browser instead, landing on
 * `/checkin`, which does the same check-in for a signed-in host. So the flow
 * degrades to "works, one tap longer" rather than breaking - which is why this
 * returns 404 when unset rather than serving a placeholder. A malformed or
 * wrong-fingerprint `assetlinks.json` fails verification exactly as an absent
 * one does, while looking configured to anyone reading the repository.
 *
 * # Configuring it
 *
 * Get the SHA-256 fingerprint of the certificate the shipped APK is signed
 * with. For an EAS build that is the Play/EAS keystore, not a local debug key:
 *
 *     npx eas-cli credentials --platform android
 *
 * then set `ANDROID_CERT_SHA256` in Vercel to the colon-separated hex it
 * prints, e.g. `AB:CD:...:EF`. Multiple fingerprints - a Play App Signing key
 * and an upload key, say - can be given comma-separated, which is normal and
 * required if Play re-signs the app.
 *
 * Verify afterwards with:
 *
 *     adb shell pm get-app-links xyz.eventerz.app
 */

const PACKAGE_NAME = 'xyz.eventerz.app';

export function GET() {
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  if (fingerprints.length === 0) {
    return new Response('Not configured', { status: 404 });
  }

  const body = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: PACKAGE_NAME,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'content-type': 'application/json',
      // Android re-checks periodically; an hour is short enough that rotating
      // a signing key is not a day-long outage and long enough to be cached.
      'cache-control': 'public, max-age=3600',
    },
  });
}
