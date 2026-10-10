# Pocket Pup

A math adventure for kids. Raise a puppy, then set out as Granny Dot's apprentice to rebuild Woofwood Valley block by block. Every chop, dig and bowl of stew is a math question from the chosen grade (Kindergarten to Grade 6, Common Core / California standards).

- `index.html` is the whole game: one self-contained web page. Open it in any modern browser.
- `android/` wraps that page as a full-screen Android app for tablets, including Amazon Fire.
- `PocketPup.apk` is the built app. The same file is attached to the latest release.

## Put it on a tablet

1. On the tablet's browser, open this repo's **Releases** page and tap `PocketPup.apk`.
2. Open the downloaded file. When the tablet asks, allow installs from that browser ("Install unknown apps").
3. Tap **Install**, then open Pocket Pup from the home screen.

## Rebuild the app

Needs a JDK, Gradle and the Android SDK (platform 34).

```bash
cd android
echo "sdk.dir=/path/to/android/sdk" > local.properties
gradle assembleDebug
```

The build copies `../index.html` into the app, so the app always matches the web page.
