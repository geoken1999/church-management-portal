export const DEFAULT_CHURCH_LOGO = "/default_church_logo.png";

// The header every public, unauthenticated page (Forms, Event
// registration, the fundraiser Give page, a shared Folder) shows at the
// top — the church's OWN logo and name, not KingdomFlow's, since a
// registrant/giver/visitor is interacting with that church, not with this
// app. "Powered by KingdomFlow" (PublicPoweredByFooter below) stays as the
// small attribution at the bottom of the same pages.
export function PublicBrandHeader({ logoUrl, name }: { logoUrl: string | null; name: string }) {
  return (
    <div className="mb-6 flex flex-col items-center gap-3 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- an org's own public Storage URL, not a static app asset next/image would need configuring for */}
      <img src={logoUrl ?? DEFAULT_CHURCH_LOGO} alt={name} className="size-16 rounded-xl object-cover shadow-sm" />
      <h1 className="font-heading text-lg font-bold">{name}</h1>
    </div>
  );
}

export function PublicPoweredByFooter() {
  return <p className="mt-6 text-center text-xs text-muted-foreground">Powered by KingdomFlow</p>;
}
