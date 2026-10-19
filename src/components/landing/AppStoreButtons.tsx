import { APP_STORE_URL } from "@/lib/app-links";
import { PlayStoreButton } from "@/components/landing/PlayStoreButton";

// The store buttons for the landing page: Google Play always; the App Store once its link is set, a
// "coming soon" badge until then.
export function AppStoreButtons({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-3 ${className}`}
    >
      <PlayStoreButton />
      {APP_STORE_URL ? (
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-3 rounded-lg border border-border bg-foreground px-4 py-2 text-background transition-opacity hover:opacity-90"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-6 shrink-0 fill-current"
          >
            <path d="M16.37 1.43c0 1.14-.46 2.22-1.2 3-.8.85-2.1 1.5-3.16 1.42-.13-1.1.4-2.25 1.14-3 .83-.87 2.2-1.5 3.22-1.42ZM20.5 17.2c-.55 1.27-.82 1.84-1.52 2.96-1 1.57-2.4 3.52-4.14 3.54-1.55.02-1.95-1-4.05-.99-2.1.01-2.54 1.01-4.09.99-1.74-.02-3.07-1.78-4.07-3.35C-.2 16.1-.5 10.9 1.3 8.2c1.28-1.92 3.3-3.05 5.2-3.05 1.93 0 3.14 1.06 4.74 1.06 1.55 0 2.5-1.06 4.73-1.06 1.69 0 3.48.92 4.76 2.5-4.18 2.29-3.5 8.25.77 9.55Z" />
          </svg>
          <span className="text-left leading-tight">
            <span className="block text-[10px] uppercase tracking-wide opacity-80">
              Download on the
            </span>
            <span className="block text-base font-semibold">App Store</span>
          </span>
        </a>
      ) : (
        <span
          aria-label="App Store, coming soon"
          className="inline-flex cursor-default items-center gap-3 rounded-lg border border-border bg-muted px-4 py-2 text-muted-foreground"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-6 shrink-0 fill-current"
          >
            <path d="M16.37 1.43c0 1.14-.46 2.22-1.2 3-.8.85-2.1 1.5-3.16 1.42-.13-1.1.4-2.25 1.14-3 .83-.87 2.2-1.5 3.22-1.42ZM20.5 17.2c-.55 1.27-.82 1.84-1.52 2.96-1 1.57-2.4 3.52-4.14 3.54-1.55.02-1.95-1-4.05-.99-2.1.01-2.54 1.01-4.09.99-1.74-.02-3.07-1.78-4.07-3.35C-.2 16.1-.5 10.9 1.3 8.2c1.28-1.92 3.3-3.05 5.2-3.05 1.93 0 3.14 1.06 4.74 1.06 1.55 0 2.5-1.06 4.73-1.06 1.69 0 3.48.92 4.76 2.5-4.18 2.29-3.5 8.25.77 9.55Z" />
          </svg>
          <span className="text-left leading-tight">
            <span className="block text-[10px] uppercase tracking-wide">
              Coming soon on the
            </span>
            <span className="block text-base font-semibold">App Store</span>
          </span>
        </span>
      )}
    </div>
  );
}
