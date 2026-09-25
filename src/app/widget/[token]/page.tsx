import { createClient } from "@/lib/supabase/server";
import { EmbeddableWidget } from "@/components/widget/EmbeddableWidget";

export const metadata = { title: "Widget" };

export default async function EmbeddedWidgetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_widget", { token }).maybeSingle();

  // Rendered inside a third-party site's iframe (see loader.js) — nothing
  // shown here for a missing/disabled widget, since there's no visible
  // chrome to explain an error to a site visitor who never asked for one.
  if (!data) {
    return <style>{"html,body{background:transparent !important}"}</style>;
  }

  return (
    <>
      <style>{"html,body{background:transparent !important;overflow:hidden}"}</style>
      <EmbeddableWidget
        token={token}
        primaryColor={data.primary_color}
        position={data.position}
        buttonLabel={data.button_label}
        greetingTitle={data.greeting_title}
        greetingMessage={data.greeting_message}
        fields={data.fields ?? []}
      />
    </>
  );
}
