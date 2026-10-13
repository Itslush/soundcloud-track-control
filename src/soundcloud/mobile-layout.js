const attribute = 'data-track-control-mobile-layout';
const prefix = `html[${attribute}]`;

const css = `
${prefix} { --tc-phone-unit:calc(1px * var(--tc-phone-scale)); }
${prefix} body { min-width:0 !important; padding-bottom:var(--tc-phone-dock) !important; }
${prefix} .playControls,${prefix} .playControls * { visibility:hidden !important; }
${prefix} .l-container { width:100% !important; min-width:0 !important; max-width:none !important; box-sizing:border-box; padding-inline:calc(12 * var(--tc-phone-unit)) !important; }
${prefix} .l-main { float:none !important; width:100% !important; min-width:0 !important; margin:0 !important; padding:0 !important; border-right:0; }
${prefix} .l-content { padding-top:calc(12 * var(--tc-phone-unit)) !important; }
${prefix} :is(.l-sidebar,.l-sidebar-right),${prefix} .l-sidebar-right .l-fixed { position:static !important; float:none !important; width:100% !important; margin:0 !important; padding:calc(12 * var(--tc-phone-unit)) 0 !important; transform:none !important; }
${prefix} .header { position:relative !important; height:auto !important; top:auto !important; }
${prefix} .header__inner { display:flex !important; flex-wrap:wrap; height:auto !important; gap:calc(8 * var(--tc-phone-unit)); padding-block:calc(8 * var(--tc-phone-unit)); }
${prefix} :is(.header__left,.header__middle,.header__right) { display:flex !important; float:none !important; width:100% !important; min-width:0; margin:0 !important; align-items:center; gap:calc(8 * var(--tc-phone-unit)); }
${prefix} .header__middle { flex:1 0 100%; }
${prefix} .header__search,${prefix} .headerSearch { width:100% !important; margin:0 !important; }
${prefix} .headerSearch__input { width:100% !important; min-height:calc(44 * var(--tc-phone-unit)); font-size:calc(16 * var(--tc-phone-unit)); padding-inline:calc(12 * var(--tc-phone-unit)); color:var(--input-default-font-color,currentColor); background:var(--input-default-background-color,var(--highlight-color,#303030)); border:calc(1 * var(--tc-phone-unit)) solid var(--input-default-border-color,currentColor); border-radius:calc(4 * var(--tc-phone-unit)); }
${prefix} .headerSearch__submit { width:calc(44 * var(--tc-phone-unit)); height:calc(44 * var(--tc-phone-unit)); right:0; top:0; }
${prefix} :is(.header__navWrapper,.header__right) { overflow-x:auto; overscroll-behavior-x:contain; }
${prefix} .header__navWrapper { min-width:0; flex:1; }
${prefix} .header__navMenu { display:flex; float:none !important; width:max-content; min-width:100%; margin:0; padding:0; }
${prefix} .header__navMenuItem { float:none !important; margin:0 !important; }
${prefix} .header :is(a,button) { display:inline-flex; align-items:center; justify-content:center; min-width:calc(44 * var(--tc-phone-unit)); min-height:calc(44 * var(--tc-phone-unit)); height:auto !important; font-size:calc(14 * var(--tc-phone-unit)); line-height:1.4; padding:calc(6 * var(--tc-phone-unit)); box-sizing:border-box; }
${prefix} .header__logo { float:none !important; flex:none; }
${prefix} .header__logoLink-wordmark { display:none !important; }
${prefix} .header__logoLink-iconOnly { display:flex !important; width:calc(44 * var(--tc-phone-unit)) !important; overflow:hidden; font-size:0 !important; }
${prefix} .header__logoLink svg { width:calc(24 * var(--tc-phone-unit)); height:calc(24 * var(--tc-phone-unit)); }
${prefix} :is(.header__right,.header__loginMenu,.header__upload) { flex-shrink:0; }
${prefix} :is(.g-tabs,.g-tabs-wrapper) { min-width:0; max-width:100%; overflow-x:auto; overscroll-behavior-x:contain; }
${prefix} .g-tabs { display:flex !important; flex-wrap:nowrap; width:100%; white-space:nowrap; }
${prefix} .g-tabs > li { flex:none; }
${prefix} .g-tabs a { display:flex; align-items:center; min-height:calc(44 * var(--tc-phone-unit)); padding:calc(8 * var(--tc-phone-unit)); font-size:calc(16 * var(--tc-phone-unit)); }
${prefix} .l-main :is(h1,h2,h3) { font-size:calc(20 * var(--tc-phone-unit)) !important; line-height:1.3; }
${prefix} .l-main :is(p,.sc-text-h4,.sc-type-medium,.sc-type-small,.soundTitle__title) { font-size:calc(16 * var(--tc-phone-unit)) !important; line-height:1.4 !important; }
${prefix} .l-main :is(button,input,select) { min-height:calc(44 * var(--tc-phone-unit)); font-size:calc(16 * var(--tc-phone-unit)); }
${prefix} .l-main button { min-width:calc(44 * var(--tc-phone-unit)); }
${prefix} :is(.soundBadgeList,.lazyLoadingList__list,.soundBadgeList:not(.compact) > .sc-list-nostyle):has(> li > :is(.soundBadge:not(.compact),.playableTile)) { display:grid !important; grid-template-columns:repeat(var(--tc-phone-columns),minmax(0,1fr)); gap:calc(16 * var(--tc-phone-unit)) calc(12 * var(--tc-phone-unit)); }
${prefix} :is(.soundBadgeList,.lazyLoadingList__list,.soundBadgeList:not(.compact) > .sc-list-nostyle):has(> li > :is(.soundBadge:not(.compact),.playableTile)) > li { width:100% !important; min-width:0; float:none !important; padding:0 !important; margin:0 !important; }
${prefix} .tileGallery__slider { width:100% !important; margin:0 !important; padding:0 !important; }
${prefix} .tileGallery__sliderPanel { display:grid !important; grid-template-columns:repeat(var(--tc-phone-columns),minmax(0,1fr)); transform:none !important; max-height:none !important; height:auto !important; gap:calc(16 * var(--tc-phone-unit)) calc(12 * var(--tc-phone-unit)); padding-bottom:calc(12 * var(--tc-phone-unit)); }
${prefix} .tileGallery__sliderPanelSlide { width:auto !important; min-width:0; margin:0 !important; padding:0 !important; }
${prefix} .tileGallery__sliderPanelSlide:empty,${prefix} .tileGallery__sliderPeek { display:none !important; }
${prefix} .tileGallery.m-hasItemsForward .tileGallery__sliderPeekForward { display:block !important; position:static !important; width:100% !important; height:auto !important; margin:0 !important; }
${prefix} .tileGallery__slideForwardButton { position:static !important; display:block !important; width:calc(44 * var(--tc-phone-unit)) !important; height:calc(44 * var(--tc-phone-unit)) !important; margin:calc(8 * var(--tc-phone-unit)) auto !important; }
${prefix} .tileGallery__slideForwardButton svg { width:calc(20 * var(--tc-phone-unit)); height:calc(20 * var(--tc-phone-unit)); }
${prefix} .tileGallery .playableTile { margin-bottom:0 !important; }
${prefix} .playableTile { width:100% !important; min-width:0; }
${prefix} .playableTile__description { height:auto !important; padding-top:calc(8 * var(--tc-phone-unit)); }
${prefix} .playableTile__heading { height:auto !important; white-space:normal !important; overflow-wrap:anywhere; font-size:calc(16 * var(--tc-phone-unit)) !important; line-height:1.4 !important; }
${prefix} .playableTile__heading:not(.playableTile__mainHeading) { font-size:calc(14 * var(--tc-phone-unit)) !important; }
${prefix} .playableTile__playButton:has(.playButton:not(.sc-button-buffering)) { visibility:visible !important; opacity:1 !important; }
${prefix} .playableTile__playButton .playButton { min-width:calc(44 * var(--tc-phone-unit)); min-height:calc(44 * var(--tc-phone-unit)); }
${prefix} .soundBadge:not(.compact) { width:100% !important; min-width:0; padding:0 !important; }
${prefix} .soundBadge:not(.compact) :is(.soundBadge__artwork,.sc-artwork,.image) { display:block; width:100% !important; height:auto !important; aspect-ratio:1; float:none; margin:0 !important; background-size:cover; }
${prefix} .soundBadge:not(.compact) .soundBadge__content { margin:calc(8 * var(--tc-phone-unit)) 0 0 !important; min-width:0; }
${prefix} .soundBadge:not(.compact) .soundTitle__title { display:block; float:none; white-space:normal; overflow-wrap:anywhere; height:auto !important; }
${prefix} .soundBadge:not(.compact) .soundTitle__username { font-size:calc(14 * var(--tc-phone-unit)); line-height:1.4; }
${prefix} .soundBadge__playButton { visibility:visible !important; }
${prefix} .soundBadge__playButton .sc-button-play { min-width:calc(44 * var(--tc-phone-unit)); min-height:calc(44 * var(--tc-phone-unit)); }
${prefix} :is(.soundBadge__actions,.soundActions__mine) { visibility:visible !important; }
${prefix} :focus-visible { outline:calc(2 * var(--tc-phone-unit)) solid currentColor; outline-offset:calc(2 * var(--tc-phone-unit)); }
`;

export function createMobileLayout(document) {
  const root = document.documentElement;
  const style = document.createElement('style');
  style.textContent = css;
  const properties = new Map();
  const originalAttribute = root.getAttribute(attribute);
  function dispose() {
    style.remove();
    if (originalAttribute === null) root.removeAttribute(attribute);
    else root.setAttribute(attribute, originalAttribute);
    for (const [name, { value, priority }] of properties)
      if (value) root.style.setProperty(name, value, priority);
      else root.style.removeProperty(name);
    properties.clear();
  }
  return {
    update(geometry, dockHeight = 0) {
      if (!geometry.touch) {
        dispose();
        return;
      }
      if (!style.isConnected) (document.head || root).append(style);
      if (!root.hasAttribute(attribute)) root.setAttribute(attribute, '');
      for (const [name, value] of Object.entries({
        '--tc-phone-scale': String(
          Math.max(1, document.defaultView.innerWidth / geometry.width),
        ),
        '--tc-phone-dock': `${(dockHeight + 16) / geometry.scale}px`,
        '--tc-phone-columns': geometry.width >= 600 ? '3' : '2',
      })) {
        if (!properties.has(name))
          properties.set(name, {
            value: root.style.getPropertyValue(name),
            priority: root.style.getPropertyPriority(name),
          });
        if (root.style.getPropertyValue(name) !== value)
          root.style.setProperty(name, value);
      }
    },
    dispose,
  };
}
