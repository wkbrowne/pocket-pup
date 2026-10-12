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

## Writing grader

Sentences a child types are marked on the device by a small sentence-meaning model, [potion-base-4M](https://huggingface.co/minishlab/potion-base-4M) by Minish Lab (Model2Vec, MIT license), stored in `pupgrader.js` as 8-bit numbers. A grown-up can optionally add an Anthropic API key behind the grown-up code; typed sentences are then marked by Claude instead.

## Reading voice

Questions, lessons and listening passages are read aloud by the device's own voice: the Fire tablet's text-to-speech voices, the iPad's, or the browser's. The voice and speed are chosen on the pause screen.

The web version can also use a neural story voice that runs on the device (Piper `en_US-hfc_female-medium`, CC BY-NC-SA 4.0, non-commercial use with credit; see `docs/tts/README.md`), shared with [Last Bell](https://github.com/wkbrowne/last-bell). It is a 72 MB download, so it is fetched only if someone picks "Story voice" on the pause screen, or if the device has no voice of its own. The tablet and iPad apps do not package it.

## Standards and self-checks

`docs/grade4-standards.md` maps every Grade 4 standard to a skill and describes how practice adapts. In the browser console, `pupCheck()` generates hundreds of questions per skill and lists any with a missing, duplicate or wrong answer, and `pupSim()` simulates a weak student to show how questions are shared out.
