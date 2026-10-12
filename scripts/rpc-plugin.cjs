function rpcPluginSource(userscript, version, siteUrl) {
  const content = `(() => {
    if (location.protocol !== 'https:' ||
        !['soundcloud.com', 'm.soundcloud.com'].includes(location.hostname) ||
        window !== window.top || window.__soundCloudTempoControlV1) return;
    ${userscript}
    // The audio hooks belong to this document and require a reload to remove.
    window.__scrpc_cleanup_soundcloud_tempo_control = () => {
      window.setTimeout(() => window.location.reload(), 0);
    };
  })();`;
  return `/**
 * @name SoundCloud Track Control
 * @author Itslush
 * @version ${version}
 * @description Tempo, pitch, saved tracks and timelines inside SoundCloud.
 * @license MIT
 * @homepage ${siteUrl}
 */
module.exports = {
  contentScript() { return ${JSON.stringify(content)}; }
};
`;
}

module.exports = { rpcPluginSource };
