import Image from "next/image";

// True intrinsic size of public/logo.png. Passed as-is (rather than a
// pre-scaled width) so Next's rendered-vs-attribute size check doesn't flag
// a sub-pixel mismatch — display size is controlled entirely via the
// `style` height below, with width left to scale automatically.
const LOGO_INTRINSIC_WIDTH = 1334;
const LOGO_INTRINSIC_HEIGHT = 335;

interface LogoProps {
  /** "full" is the mark + wordmark; "icon" is the square mark alone, for tight spaces like the dashboard header. */
  variant?: "full" | "icon";
  size?: "default" | "sm";
}

export function Logo({ variant = "full", size = "default" }: LogoProps) {
  const height = size === "sm" ? 24 : 32;

  if (variant === "icon") {
    return (
      <Image
        src="/icon.png"
        alt="KingdomFlow"
        width={height}
        height={height}
        priority
        className="rounded-lg"
      />
    );
  }

  return (
    <Image
      src="/logo.png"
      alt="KingdomFlow"
      width={LOGO_INTRINSIC_WIDTH}
      height={LOGO_INTRINSIC_HEIGHT}
      priority
      style={{ height, width: "auto" }}
    />
  );
}
