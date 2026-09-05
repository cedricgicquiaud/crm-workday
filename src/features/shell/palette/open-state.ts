/** Ouverture de la palette, partagée entre le raccourci clavier, le bouton de la barre supérieure et la palette elle-même. */
let open = false;
const listeners = new Set<() => void>();

export function setPaletteOpen(value: boolean) {
  if (open === value) return;
  open = value;
  for (const listener of listeners) listener();
}

export const openPalette = () => setPaletteOpen(true);
export const closePalette = () => setPaletteOpen(false);
export const togglePalette = () => setPaletteOpen(!open);

export function subscribePaletteOpen(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const isPaletteOpen = () => open;
