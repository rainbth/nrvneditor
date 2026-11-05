import type { Transition } from "motion/react";

export const springSoft: Transition = {
  type: "spring",
  stiffness: 320,
  damping: 30,
  mass: 0.9,
};

export const springSnappy: Transition = {
  type: "spring",
  stiffness: 460,
  damping: 34,
};

export const tweenQuick: Transition = {
  duration: 0.2,
  ease: [0.22, 1, 0.36, 1],
};
