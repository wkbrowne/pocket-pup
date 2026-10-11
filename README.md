# Population Pup

A math adventure for kids. Raise a puppy, then set out as Granny Dot's apprentice to rebuild Woofwood Valley block by block. Every chop, dig and bowl of stew is a math or English question from the chosen grade (Kindergarten to Grade 6, Common Core / California standards). Every building houses new neighbours, the population grows, and a ship opens up cities across the sea.

The repo and the Android package id still use the original name, Pocket Pup.

- `index.html` is the whole game: one self-contained web page. Open it in any modern browser.
- `android/` wraps that page as a full-screen Android app for tablets, including Amazon Fire.
- `PocketPup.apk` is the built, release-signed app. The same file is attached to the latest release.
- `docs/` is the site: the game at https://wkbrowne.github.io/pocket-pup/ and the privacy policy. `docs/index.html` is a copy of `index.html` with a doctype line added.
- `store/` holds the Amazon Appstore listing text, icons and screenshots.

## Put it on a tablet

1. On the tablet's browser, open this repo's **Releases** page and tap `PocketPup.apk`.
2. Open the downloaded file. When the tablet asks, allow installs from that browser ("Install unknown apps").
3. Tap **Install**, then open Population Pup from the home screen.

## Rebuild the app

Needs a JDK, Gradle and the Android SDK (platform 34). The fonts are bundled, so the app makes no network requests.

Release builds are signed with a key kept outside this repo in `~/pocketpup-signing/`. Without that folder, use `gradle assembleDebug`.

```bash
cd android
echo "sdk.dir=/path/to/android/sdk" > local.properties
gradle assembleRelease
```

The build copies `../index.html` into the app, so the app always matches the web page.
