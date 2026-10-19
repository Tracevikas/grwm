import { PageShell } from "@/components/PageShell";
import { PageSkeleton } from "@/components/PageSkeleton";
import { TodayView } from "@/components/TodayView";
import { loadBoardPieces } from "@/lib/queries";
import { getUser } from "@/lib/supabase/server";

export default function TodayPage() {
  return (
    <PageShell fallback={<PageSkeleton />}>
      <Today />
    </PageShell>
  );
}

async function Today() {
  const { supabase } = await getUser();
  return <TodayView pieces={await loadBoardPieces(supabase)} />;
}
