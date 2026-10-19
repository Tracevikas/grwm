import { PageShell } from "@/components/PageShell";
import { PageSkeleton } from "@/components/PageSkeleton";
import { ShuffleView } from "@/components/ShuffleView";
import { loadBoardPieces } from "@/lib/queries";
import { getUser } from "@/lib/supabase/server";

export default function ShufflePage() {
  return (
    <PageShell fallback={<PageSkeleton />}>
      <Shuffle />
    </PageShell>
  );
}

async function Shuffle() {
  const { supabase } = await getUser();
  return <ShuffleView pieces={await loadBoardPieces(supabase)} />;
}
