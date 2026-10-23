# Android and iOS apps

JobRoles is an installable web app (manifest, icons, offline page, push notifications), so the store apps wrap
the live site rather than duplicating it. New features reach the apps the moment the site deploys.

## Android (Google Play): Trusted Web Activity

1. Install Bubblewrap: `npm i -g @bubblewrap/cli` (it installs a JDK and Android SDK on first run).
2. Replace `REPLACE-WITH-YOUR-DOMAIN` in `mobile/twa-manifest.json` with the canonical domain, then
   `cd mobile && bubblewrap build`. This produces `app-release-bundle.aab`.
3. Create the app in Play Console, upload the bundle to internal testing, and copy the **App signing key
   SHA-256 fingerprint** from Play Console → Setup → App signing.
4. In Netlify set `ANDROID_PACKAGE=au.com.jobroles.app` and `ANDROID_CERT_SHA256=<fingerprint>` and redeploy.
   `https://<domain>/.well-known/assetlinks.json` must then list them, which removes the browser bar in the app.
5. Push notifications work inside the app through the same subscription switch.

## iOS (App Store)

Apple only accepts web-wrapped apps that feel native, so use PWABuilder's iOS package, which adds native
navigation and share support:

1. Open https://www.pwabuilder.com, enter the live domain and choose **iOS**. Download the Xcode project.
2. Set the bundle ID (for example `au.com.jobroles.app`) and sign with your Apple Developer team in Xcode.
3. In Netlify set `APPLE_APP_ID=<TEAMID>.au.com.jobroles.app` and redeploy, so
   `https://<domain>/.well-known/apple-app-site-association` enables universal links to jobs and searches.
4. Submit through App Store Connect. Mention in review notes that job seekers search, apply and track
   applications in the app, and that employers are verified.

On iPhone, web push needs iOS 16.4 or later and works for people who add the site to their Home Screen or
use the App Store app.
