import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink/90",
  secondary: "border border-hairline bg-surface text-ink hover:bg-subtle",
  ghost: "text-ink-2 hover:bg-subtle hover:text-ink",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium " +
  "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "disabled:pointer-events-none disabled:opacity-50";

export function Button({
  variant = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...props} className={cn(BASE, VARIANTS[variant], className)} />;
}

/** The same control when the action is navigation — so it behaves like a link. */
export function ButtonLink({
  to,
  variant = "secondary",
  className,
  children,
}: {
  to: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={cn(BASE, VARIANTS[variant], className)}>
      {children}
    </Link>
  );
}
