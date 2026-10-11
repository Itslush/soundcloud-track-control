import hashlib
from PIL import Image, PngImagePlugin
from playwright.sync_api import sync_playwright
from userscript_fixture import ROOT, browser_options

source = ROOT / 'site/public/favicon.svg'
target = ROOT / 'site/public/share-icon.png'
with sync_playwright() as p:
    browser = p.chromium.launch(**browser_options(), headless=True)
    page = browser.new_page(viewport={'width': 512, 'height': 512}, device_scale_factor=1)
    page.goto(source.as_uri())
    page.screenshot(path=str(target), omit_background=True)
    browser.close()
with Image.open(target) as icon:
    assert icon.size == (512, 512)
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text('Origin', 'Rasterized from the existing Tempo Control favicon.svg with Chromium; no redesign.')
    metadata.add_text('Source SHA256', hashlib.sha256(source.read_bytes()).hexdigest())
    icon.save(target, pnginfo=metadata)
print('Existing icon exported to share-icon.png (512×512).')
