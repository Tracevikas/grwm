import { notFound } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { CanvasEditor } from "@/components/CanvasEditor";
import { PageShell } from "@/components/PageShell";
import { PageSkeleton } from "@/components/PageSkeleton";
import { SubmitButton } from "@/components/SubmitButton";
import { loadBoardPieces } from "@/lib/queries";
import { getUser } from "@/lib/supabase/server";
import type { Look } from "@/lib/types";
import { deleteLook } from "../actions";

export default function LookPage(props: PageProps<"/looks/[id]">) {
  return (
    <PageShell fallback={<PageSkeleton />}>
      <LookDetail {...props} />
    </PageShell>
  );
}

const SOURCE_LABELS: Record<Look["source"], string> = {
  today: "Picked by the Today stylist",
  shuffle: "Found with Dress Me",
  canvas: "Made on the canvas",
};

async function LookDetail(props: PageProps<"/looks/[id]">) {
  const { id } = await props.params;
  const { supabase } = await getUser();
  const [{ data }, pieces] = await Promise.all([
    supabase.from("looks").select("*").eq("id", id).maybeSingle(),
    loadBoardPieces(supabase),
  ]);
  if (!data) notFound();
  const look = data as Look;

  return (
    <div className="space-y-6">
      <BackLink href="/looks">Looks</BackLink>
      <p className="rise text-sm text-muted">{SOURCE_LABELS[look.source]}</p>
      <CanvasEditor key={look.id} pieces={pieces} look={look} />
      <form action={deleteLook.bind(null, look.id)} className="text-center">
        <SubmitButton pendingLabel="Deleting…" className="rounded-full px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10">
          Delete look
        </SubmitButton>
      </form>
    </div>
  );
}
