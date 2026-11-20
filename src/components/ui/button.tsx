import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/* Realce interno e sombra curta só nos temas modernos; o Clássico permanece chapado. */
const raised =
  "[[data-workspace-style=modern]_&]:shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(0_0_0/0.28)]"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-xs font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        default: `bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:bg-primary/80 active:scale-[0.98] ${raised}`,
        destructive: `bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 active:bg-destructive/80 active:scale-[0.98] ${raised}`,
        outline:
          "border border-border bg-transparent hover:border-ring/40 hover:bg-accent hover:text-accent-foreground active:bg-accent/70 active:scale-[0.98]",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 active:bg-secondary/70 active:scale-[0.98]",
        ghost:
          "hover:bg-accent hover:text-accent-foreground active:bg-accent/70",
        link: "text-primary underline-offset-4 decoration-primary/40 hover:underline hover:decoration-primary",
        success: `bg-success text-success-foreground shadow-sm hover:bg-success/90 active:bg-success/80 active:scale-[0.98] ${raised}`,
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-caption",
        lg: "h-10 rounded-md px-6 text-sm",
        icon: "h-9 w-9",
        "icon-sm": "h-7 w-7",
        "icon-xs": "h-6 w-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
