"use client";

import { useEffect } from "react";

/**
 * Hauteur reellement visible de l'ecran, exposee en `--app-height` sur <html>.
 *
 * Sur iPhone, le clavier recouvre la page sans la redimensionner : Safari
 * fait alors glisser toute la page vers le haut pour montrer le champ, et
 * l'en-tete sort de l'ecran. En calant la position et la hauteur de
 * l'application sur la zone visible (`visualViewport`, exposees en
 * `--app-top` / `--app-height`), l'en-tete reste en place et la zone de
 * saisie se pose juste au-dessus du clavier.
 * Sans `visualViewport` (anciens navigateurs), la CSS retombe sur 100dvh.
 */
export function useVisibleViewportHeight() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty("--app-height", `${Math.round(vv.height)}px`);
      // Decalage que Safari applique a la zone visible quand le clavier s'ouvre :
      // l'application le suit pour rester collee au haut de l'ecran.
      root.style.setProperty("--app-top", `${Math.round(vv.offsetTop)}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-top");
    };
  }, []);
}
