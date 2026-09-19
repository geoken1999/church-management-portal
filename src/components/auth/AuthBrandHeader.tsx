import { Logo } from "@/components/Logo";

export function AuthBrandHeader() {
  return (
    <div className="mb-8 flex flex-col items-center gap-3 text-center">
      <Logo />
      <p className="text-sm text-muted-foreground">Shepherd your church with clarity.</p>
    </div>
  );
}
