import { BackLink } from "@/components/BackLink";
import { CanvasEditor } from "@/components/CanvasEditor";
import { PageShell } from "@/components/PageShell";
import { PageSkeleton } from "@/components/PageSkeleton";
import { EmptyCard } from "@/components/TodayView";
import { loadBoardPieces } from "@/lib/queries";
import { getUser } from "@/lib/supabase/server";

export default function NewLookPage() {
  return (
    <PageShell fallback={<PageSkeleton />}>
      <NewLook />
    </PageShell>
  );
}

async function NewLook() {
  const { supabase } = await getUser();
  const pieces = await loadBoardPieces(supabase);

  return (
    <div className="space-y-6">
      <BackLink href="/looks">Looks</BackLink>
      <div className="rise">
        <h1 className="text-2xl font-semibold tracking-tight">New look</h1>
        <p className="mt-1 text-sm text-muted">Put pieces on the board and style them like a moodboard.</p>
      </div>
      {pieces.length === 0 ? (
        <EmptyCard title="Nothing to style yet" body="Log an outfit first; its pieces show up here to arrange." />
      ) : (
        <CanvasEditor pieces={pieces} />
      )}
    </div>
  );
}
