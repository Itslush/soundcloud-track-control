"""Attach origin metadata to captured PNGs and refresh generated checksums."""
import hashlib
import json
import os
import subprocess
from pathlib import Path
from userscript_fixture import ROOT

launcher = Path.home() / '.agents/skills/impeccable/scripts' / ('impeccable.cmd' if os.name == 'nt' else 'impeccable')
for filename in ['screenshot-evidence.json', 'feature-capture-evidence.json']:
    manifest = ROOT / 'docs' / filename
    evidence = json.loads(manifest.read_text(encoding='utf-8'))
    for item in evidence['screenshots']:
        image = ROOT / 'site/public/screenshots' / item['file']
        origin = f"Origin: Unedited browser screenshot at {item['url']}. {item['state']} Capture record: docs/{filename}, artifact SHA256 {evidence['artifactSha256']}."
        subprocess.run([str(launcher), 'embed-prompt', str(image), '--prompt', origin], check=True, capture_output=True, text=True)
        item['sha256'] = hashlib.sha256(image.read_bytes()).hexdigest()
    manifest.write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
    print(f"Embedded origins and refreshed {len(evidence['screenshots'])} PNG checksums in {filename}.")
