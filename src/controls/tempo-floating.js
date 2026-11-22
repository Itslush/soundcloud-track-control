import { computePosition, flip, offset, shift } from '@floating-ui/dom';

export async function positionFloatingMenu(
  trigger,
  menu,
  { gap = 4, padding = 8 } = {},
) {
  const { x, y, placement } = await computePosition(trigger, menu, {
    placement: 'bottom-start',
    strategy: 'absolute',
    middleware: [offset(gap), flip({ padding }), shift({ padding })],
  });
  menu.style.left = `${Math.round(x)}px`;
  menu.style.top = `${Math.round(y)}px`;
  menu.style.bottom = 'auto';
  menu.style.right = 'auto';
  menu.dataset.side = placement.split('-')[0];
}
