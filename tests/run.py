import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SUITES = [
    'verify-release.py', 'verify-inline.py', 'verify-mobile-player.py', 'verify-phone-layout.py', 'verify-ux.py', 'verify-library.py', 'verify-compact-library.py', 'verify-control-styles.py',
    'verify-control-affordances.py', 'verify-editor-session.py', 'verify-timeline.py', 'verify-pitch-automation.py', 'verify-pitch-mode.py', 'verify-wasm.py', 'verify-wasm-boundaries.py',
    'verify-share-links.py', 'verify-native-copy.py', 'verify-embedded-track.py', 'verify-display-duration.py', 'verify-editor-zoom.py',
    'verify-timeline-pan.py', 'verify-timeline-pan-style.py', 'verify-fade-start.py', 'verify-output.py', 'verify-crossfade.py', 'verify-track-visuals.py', 'verify-overhead.py', 'verify-artwork-overhead.py', 'verify-updates.py',
]

failed = []
for suite in SUITES:
    print(f'Running {suite}', flush=True)
    result = subprocess.run([sys.executable, str(ROOT/suite)], cwd=ROOT.parent,
                            env={**os.environ, 'PYTHONUNBUFFERED': '1'})
    if result.returncode:
        failed.append(suite)
if failed:
    print('Failed suites: ' + ', '.join(failed), flush=True)
    sys.exit(1)
print(f'Passed {len(SUITES)} muted browser suites.', flush=True)
