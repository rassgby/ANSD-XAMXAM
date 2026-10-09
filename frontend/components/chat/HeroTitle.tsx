"use client";

import { motion, useReducedMotion } from "motion/react";
import { welcome, type Lang } from "@/lib/languages";

/**
 * Titre d'accueil, revele mot par mot a l'arrivee sur la page (montee +
 * flou qui se dissipe), puis « en chiffres » garde un reflet degrade qui
 * glisse lentement, et un reflet clair traverse le reste du titre. Desactive si l'utilisateur a demande a reduire les
 * animations.
 */
export function HeroTitle({ lang = "FR" }: { lang?: Lang }) {
  const LINES = welcome(lang).hero;
  const reduceMotion = useReducedMotion();
  let index = 0;

  return (
    <h1 className="text-[2.5rem] font-extrabold leading-[1.1] tracking-tight text-brand-900 sm:text-6xl">
      {LINES.map((line, l) => (
        <span key={l} className="block">
          {line.map((word) => {
            const delay = 0.08 * index++;
            return (
              <motion.span
                key={word.text}
                className="inline-block whitespace-pre"
                initial={reduceMotion ? false : { opacity: 0, y: 24, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
              >
                {word.highlight ? (
                  <motion.span
                    className="bg-gradient-to-r from-brand-600 via-brand-400 to-brand-800 bg-[length:200%_auto] bg-clip-text text-transparent"
                    animate={reduceMotion ? undefined : { backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                    transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: delay + 0.6 }}
                  >
                    {word.text}
                  </motion.span>
                ) : reduceMotion ? (
                  word.text
                ) : (
                  // Meme bleu qu'avant ; seul un reflet clair passe de temps en temps (decale mot
                  // a mot : il traverse tout le titre de gauche a droite).
                  <motion.span
                    className="bg-clip-text text-transparent"
                    style={{
                      backgroundImage:
                        "linear-gradient(100deg, var(--color-brand-900) 40%, var(--color-brand-300) 50%, var(--color-brand-900) 60%)",
                      backgroundSize: "300% 100%",
                    }}
                    initial={{ backgroundPosition: "100% 50%" }}
                    animate={{ backgroundPosition: ["100% 50%", "0% 50%"] }}
                    transition={{ duration: 1.6, ease: "easeInOut", repeat: Infinity, repeatDelay: 3.4, delay: delay + 1 }}
                  >
                    {word.text}
                  </motion.span>
                )}
                {" "}
              </motion.span>
            );
          })}
        </span>
      ))}
    </h1>
  );
}
