const fs = require('node:fs');
const path = require('node:path');
const { root, readConfig } = require('./config.cjs');

function redirectPage(siteUrl) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SoundCloud Track Control has moved</title><p>SoundCloud Track Control has moved. <a id="destination" href="${siteUrl}">Open the new website</a>.</p><script>
const site = ${JSON.stringify(siteUrl)};
const prefix = '/soundcloud-tempo-control/';
const suffix = location.pathname.startsWith(prefix) ? location.pathname.slice(prefix.length) : '';
const destination = site + suffix + location.search + location.hash;
document.getElementById('destination').href = destination;
location.replace(destination);
</script></html>`;
}

function buildCompatibility(destination) {
  const config = readConfig(true);
  const html = redirectPage(config.siteUrl);
  for (const route of ['', 'guide', 'share', 'set', 'updates', 'privacy']) {
    const directory = path.join(destination, route);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'index.html'), html);
  }
  fs.writeFileSync(path.join(destination, '404.html'), html);
  fs.copyFileSync(
    path.join(root, 'LICENSE'),
    path.join(destination, 'LICENSE.txt'),
  );
  const licenses = path.join(destination, 'licenses');
  fs.mkdirSync(licenses, { recursive: true });
  for (const file of fs.readdirSync(path.join(root, 'site/public/licenses'))) {
    fs.copyFileSync(
      path.join(root, 'site/public/licenses', file),
      path.join(licenses, file),
    );
  }
  const downloads = path.join(destination, 'downloads');
  fs.mkdirSync(downloads, { recursive: true });
  for (const file of [
    'soundcloud-tempo-control.user.js',
    'soundcloud-tempo-control.meta.js',
    'soundcloud-track-control.user.js',
    'soundcloud-track-control.meta.js',
    'soundcloud_tempo_control.js',
    'soundcloud-track-control.rpc.js',
    'release.json',
    'SHA256SUMS.txt',
  ]) {
    fs.copyFileSync(
      path.join(root, 'site/public/downloads', file),
      path.join(downloads, file),
    );
  }
}

module.exports = { redirectPage, buildCompatibility };
if (require.main === module) {
  if (!process.argv[2])
    throw new Error('Pass the compatibility site output directory');
  buildCompatibility(path.resolve(process.argv[2]));
}
