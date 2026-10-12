const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { redirectPage } = require('../scripts/build-compatibility.cjs');

test('old website routes keep the complete query and shared-settings fragment', () => {
  const html = redirectPage(
    'https://itslush.github.io/soundcloud-track-control/',
  );
  for (const [pathname, suffix] of [
    ['/soundcloud-tempo-control/', ''],
    ['/soundcloud-tempo-control/share/', 'share/'],
    ['/soundcloud-tempo-control/set/', 'set/'],
    ['/soundcloud-tempo-control/guide/', 'guide/'],
  ]) {
    let redirected;
    const link = {};
    vm.runInNewContext(html.match(/<script>([\s\S]*)<\/script>/)[1], {
      document: { getElementById: () => link },
      location: {
        pathname,
        search: '?track=one',
        hash: '#sct=SCT1.example',
        replace(url) {
          redirected = url;
        },
      },
    });
    assert.equal(
      redirected,
      `https://itslush.github.io/soundcloud-track-control/${suffix}?track=one#sct=SCT1.example`,
    );
    assert.equal(link.href, redirected);
  }
});
