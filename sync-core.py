#!/usr/bin/env python3
"""Copies the shared learning engine into this game.

The engine lives in its own repository (../learn-core by default). This game keeps a copy in vendor/learn-core.js and,
because the game is one self-contained page, a second copy inside index.html between the <learn-core> markers.
Run this after the engine changes; build-web.py refuses to build if the two copies differ or the engine's tests fail."""
import io, os, shutil, sys
src = sys.argv[1] if len(sys.argv) > 1 else '../learn-core/learn-core.js'
if os.path.exists(src): shutil.copyfile(src, 'vendor/learn-core.js')
else: print('engine source not found at', src, '- using the copy in vendor/')
core = io.open('vendor/learn-core.js', encoding='utf-8').read().rstrip('\n')
page = io.open('index.html', encoding='utf-8').read()
a = page.index('/* <learn-core>'); a = page.index('\n', a) + 1; b = page.index('/* </learn-core> */')
io.open('index.html', 'w', encoding='utf-8').write(page[:a] + core + '\n' + page[b:])
print('index.html now carries learn-core', [l for l in core.split('\n') if 'var VERSION' in l][0].strip())
