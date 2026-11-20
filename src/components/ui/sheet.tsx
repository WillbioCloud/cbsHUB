import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Uses the installed Radix Dialog primitive: focus trap, Escape and focus restoration.
export const Sheet = DialogPrimitive.Root;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;
export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    side?: "left" | "right";
  }
>(({ className, children, side = "left", ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
    <DialogPrimitive.Content
      ref={ref}
      onOpenAutoFocus={(event) => {
        // Start at the labelled panel, avoiding an automatically opened tooltip
        // on its first button intercepting Escape. Tab still enters the controls.
        event.preventDefault();
        (event.target as HTMLElement).focus();
      }}
      className={cn(
        "workspace-sheet",
        side === "right" ? "workspace-sheet-right" : "workspace-sheet-left",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="sheet-close" aria-label="Fechar painel">
        <X className="size-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = "SheetContent";
