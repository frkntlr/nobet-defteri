import { cn } from "../lib/cn";
import type { ButtonHTMLAttributes } from "react";

type Variant = "default" | "morning" | "night" | "ghost" | "warn" | "ink";

const variants: Record<Variant, string> = {
  default: "border border-rule bg-white hover:bg-paper-2",
  morning: "bg-morning text-white hover:bg-[#a64c10]",
  night: "bg-night text-paper hover:bg-[#152844]",
  ghost: "border border-transparent bg-white/10 text-paper hover:bg-white/20",
  warn: "bg-warn text-white hover:bg-[#7d1616]",
  ink: "bg-ink text-paper hover:bg-[#2a241e]",
};

export function Button({
  className,
  variant = "default",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      {hint ? <span className="mt-0.5 block text-xs text-ink-soft">{hint}</span> : null}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-10 w-full rounded-md border border-rule bg-white px-3 text-sm outline-none focus:border-ink",
        props.className,
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-10 w-full rounded-md border border-rule bg-white px-3 text-sm outline-none focus:border-ink",
        props.className,
      )}
    />
  );
}

export function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-rule bg-white p-4 shadow-[0_1px_0_rgba(20,17,14,0.04)]", className)}>
      <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase text-morning">{title}</h2>
      {children}
    </section>
  );
}
