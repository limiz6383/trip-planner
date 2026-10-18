import { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds default padding */
  padded?: boolean;
}

export function Card({ padded = true, className = "", children, ...props }: CardProps) {
  return (
    <div
      {...props}
      className={[
        "rounded-2xl border border-line bg-surface shadow-card",
        padded ? "p-4 sm:p-5" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={["mb-3 flex items-center justify-between", className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

export function CardTitle({ className = "", children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      {...props}
      className={["font-display text-lg font-semibold text-ink", className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </h3>
  );
}
