import { getListedChurches } from "@/lib/landing/churches";
import { countryName, initialsOf } from "@/lib/landing/display";
import { Badge } from "@/components/ui/badge";

// "Churches on KingdomFlow": only the churches a platform admin has switched on, each with its logo (or initials),
// name and country. The section is not shown at all when none are listed.
export async function ChurchesSection() {
  const churches = await getListedChurches();
  if (churches.length === 0) return null;
  return (
    <section id="churches" className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="secondary" className="mb-4">
            Churches on KingdomFlow
          </Badge>
          <h2 className="font-heading text-3xl font-bold tracking-tight">
            Trusted by churches like yours
          </h2>
          <p className="mt-3 text-muted-foreground">
            These churches run their members, giving, events and communication
            on KingdomFlow.
          </p>
        </div>
        <ul className="mt-10 flex flex-wrap items-start justify-center gap-x-10 gap-y-8">
          {churches.map((church) => (
            <li
              key={church.id}
              className="flex w-32 flex-col items-center gap-3 text-center sm:w-36"
            >
              {church.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={church.logoUrl}
                  alt={church.name}
                  className="size-24 rounded-2xl border border-border bg-white object-contain p-2 shadow-sm sm:size-28"
                  loading="lazy"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex size-24 items-center justify-center rounded-2xl bg-primary/10 font-heading text-2xl font-bold text-primary shadow-sm sm:size-28"
                >
                  {initialsOf(church.name)}
                </span>
              )}
              <div>
                <p className="font-heading text-xs font-bold leading-snug">
                  {church.name}
                </p>
                {countryName(church.country) && (
                  <p className="text-[11px] text-muted-foreground">
                    {countryName(church.country)}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
