import { PLAY_STORE_URL } from "@/lib/app-links";

// A "Get it on Google Play" link. Plain markup (a play-triangle mark and two lines of text), not
// Google's badge artwork, so no image file is needed.
export function PlayStoreButton({ className = "" }: { className?: string }) {
  return (
    <a
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-3 rounded-lg border border-border bg-foreground px-4 py-2 text-background transition-opacity hover:opacity-90 ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="size-6 shrink-0 fill-current"
      >
        <path d="M4 2.6v18.8a1 1 0 0 0 1.5.86l15.2-9.4a1 1 0 0 0 0-1.72L5.5 1.74A1 1 0 0 0 4 2.6Z" />
      </svg>
      <span className="text-left leading-tight">
        <span className="block text-[10px] uppercase tracking-wide opacity-80">
          Get it on
        </span>
        <span className="block text-base font-semibold">Google Play</span>
      </span>
    </a>
  );
}
