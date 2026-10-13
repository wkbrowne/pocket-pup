# Population Pup

One page, `index.html`. `docs/` (GitHub Pages) and `ios/PopulationPup/Web/` are generated: never edit them.

- Build: `python3 build-web.py`. It syntax-checks the page, runs the engine's tests, and hashes the files into the service-worker version, so no manual cache bump. Run it before every commit.
- Learning engine: `vendor/learn-core.js` and the copy inside `index.html` between `/* <learn-core>` markers, both from `../learn-core`. Change it there, then `python3 sync-core.py`. Never edit either copy; the build refuses if they differ.
- Preview: `.claude/launch.json` serves `docs/` on port 8771. Smoke test after a change: new game, a few actions, console errors, then the grown-up practice report (behind the grown-up code).
- Grown-up report: `practiceReport()`. Day stats: `dayTick`, `logDay`. Sittings: `Sess` (learn-core's `sessions`). Engine host and settings: where `LearnCore.create(` is called.
- Top-level bindings are not reachable from the browser console; verify through `localStorage` (`pocketpup.g.*`).
