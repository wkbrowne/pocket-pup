#!/usr/bin/env python3
"""Finds multiple-choice items in index.html whose right answer is longer than every wrong one by more than 4 characters.
A child learns 'the longest answer is right' fast. Items are the hand-written tuples ['question', 'right', ['wrong', ...]]
inside the English banks. Generators (code that builds items) are not scanned here; the ?debug page measures those.
   python3 scan-bias.py           list them, with line numbers, and a count per bank
   python3 scan-bias.py --check   exit 1 if any bank has more than MAX such items (for the build)"""
import io, re, sys
MAX = 3
src = io.open('index.html', encoding='utf-8').read()
S = r"'((?:[^'\\]|\\.)*)'"          # a single-quoted JS string
item = re.compile(r"\[\s*" + S + r"\s*,\s*" + S + r"\s*,\s*\[((?:\s*" + S + r"\s*,?)+)\]")
def unesc(t): return t.replace("\\'", "'")
hits, banks = [], {}
bank = lambda pos: (re.findall(r"^const (E_\w+|GRADES)\b", src[:pos], re.M) or ['?'])[-1]
for m in item.finditer(src):
    q, ans, opts = unesc(m.group(1)), unesc(m.group(2)), [unesc(x) for x in re.findall(S, m.group(3))]
    if not opts or len(q) < 8: continue
    if len(ans) > max(len(o) for o in opts) + 4:
        line = src.count('\n', 0, m.start()) + 1; b = bank(m.start()); banks[b] = banks.get(b, 0) + 1; hits.append((line, b, q, ans, opts))
if '--check' in sys.argv:
    bad = {b: n for b, n in banks.items() if n > MAX}
    if bad: sys.exit('longest-answer bias: ' + ', '.join(f'{b} has {n} items' for b, n in bad.items()) + ' where the right answer is longest by more than 4 characters. Run scan-bias.py.')
    print('answer-length bias ok (' + str(len(hits)) + ' items under the limit)'); sys.exit(0)
for line, b, q, ans, opts in hits: print(f"{line} [{b}] {q[:70]!r}\n    right ({len(ans)}): {ans}\n    wrong: " + ' | '.join(f'{o} ({len(o)})' for o in opts))
print('\nper bank:', banks, 'total', len(hits))
