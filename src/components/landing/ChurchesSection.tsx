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
        <ul className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {churches.map((church) => (
            <li
              key={church.id}
              className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-4 py-6 text-center shadow-sm"
            >
              {church.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={church.logoUrl}
                  alt=""
                  className="size-16 rounded-full border border-border object-cover"
                  loading="lazy"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex size-16 items-center justify-center rounded-full bg-primary/10 font-heading text-xl font-bold text-primary"
                >
                  {initialsOf(church.name)}
                </span>
              )}
              <div>
                <p className="font-heading text-sm font-bold">{church.name}</p>
                {countryName(church.country) && (
                  <p className="text-xs text-muted-foreground">
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
