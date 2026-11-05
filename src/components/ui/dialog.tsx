import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ComponentProps, createContext, type ReactNode, useContext, useState } from "react";
import { tweenQuick } from "../../lib/motion";

/**
 * Primitivas de dialog modal sobre Radix Dialog. Radix aporta portal, overlay,
 * foco atrapado, Escape y `aria-modal`; aquí sólo se aplica la presentación de
 * nrvn v3. `DialogContent` ya monta overlay + portal.
 */

const DialogOpenContext = createContext(false);

export function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: ComponentProps<typeof DialogPrimitive.Root>) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen ?? false);
  const isOpen = open ?? internalOpen;
  return (
    <DialogOpenContext.Provider value={isOpen}>
      <DialogPrimitive.Root
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={(nextOpen) => {
          setInternalOpen(nextOpen);
          onOpenChange?.(nextOpen);
        }}
        {...props}
      />
    </DialogOpenContext.Provider>
  );
}
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export interface DialogOverlayProps {
  className?: string;
}

export function DialogOverlay({ className }: DialogOverlayProps) {
  const reduceMotion = useReducedMotion();
  return (
    <DialogPrimitive.Overlay asChild forceMount>
      <motion.div
        className={["dialog-overlay", className].filter(Boolean).join(" ")}
        data-overlay=""
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={reduceMotion ? { duration: 0 } : tweenQuick}
      />
    </DialogPrimitive.Overlay>
  );
}

export interface DialogContentProps
  extends Omit<ComponentProps<typeof DialogPrimitive.Content>, "children"> {
  children: ReactNode;
}

export function DialogContent({ children, className, ...rest }: DialogContentProps) {
  const open = useContext(DialogOpenContext);
  const reduceMotion = useReducedMotion();
  const transition = reduceMotion ? { duration: 0 } : tweenQuick;
  return (
    <DialogPortal forceMount>
      <AnimatePresence>
        {open ? <DialogOverlay key="overlay" /> : null}
        {open ? (
          <DialogPrimitive.Content asChild forceMount key="content" {...rest}>
            <motion.div
              className={["dialog-content", className].filter(Boolean).join(" ")}
              aria-modal="true"
              data-overlay=""
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={transition}
              transformTemplate={(_, generatedTransform) =>
                `translate(-50%, -50%) ${generatedTransform}`
              }
            >
              {children}
            </motion.div>
          </DialogPrimitive.Content>
        ) : null}
      </AnimatePresence>
    </DialogPortal>
  );
}

export function DialogTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <DialogPrimitive.Title className={["dialog-title", className].filter(Boolean).join(" ")}>
      {children}
    </DialogPrimitive.Title>
  );
}

export function DialogDescription({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Description
      className={["dialog-description", className].filter(Boolean).join(" ")}
    >
      {children}
    </DialogPrimitive.Description>
  );
}
