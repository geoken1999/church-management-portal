import Image from "next/image";

// True intrinsic size of public/logo_light.png (and logo_dark.png, trimmed to a
// similar shape). Passed as-is (rather than a
// pre-scaled width) so Next's rendered-vs-attribute size check doesn't flag
// a sub-pixel mismatch — display size is controlled entirely via the
// `style` height below, with width left to scale automatically.
const LOGO_INTRINSIC_WIDTH = 1370;
const LOGO_INTRINSIC_HEIGHT = 347;
const DARK_LOGO_INTRINSIC_WIDTH = 1189;
const DARK_LOGO_INTRINSIC_HEIGHT = 320;

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

  // The light logo has a transparent background and is shown on light pages; in
  // dark mode the dark-theme logo (white wordmark) takes its place.
  return (
    <>
      <Image
        src="/logo_light.png"
        alt="KingdomFlow"
        width={LOGO_INTRINSIC_WIDTH}
        height={LOGO_INTRINSIC_HEIGHT}
        priority
        className="dark:hidden"
        style={{ height, width: "auto" }}
      />
      <Image
        src="/logo_dark.png"
        alt="KingdomFlow"
        width={DARK_LOGO_INTRINSIC_WIDTH}
        height={DARK_LOGO_INTRINSIC_HEIGHT}
        priority
        className="hidden dark:block"
        style={{ height, width: "auto" }}
      />
    </>
  );
}
