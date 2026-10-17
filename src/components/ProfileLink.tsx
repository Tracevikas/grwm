import Link from "next/link";
import { Avatar } from "./Avatar";
import { LinkPending } from "./LinkPending";

/** The signed-in user's avatar, top right, opening their profile. */
export function ProfileLink({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return (
    <Link
      href="/profile"
      transitionTypes={["nav-forward"]}
      aria-label="Your profile"
      className="relative rounded-full transition hover:scale-105 active:scale-95"
    >
      <Avatar name={name} url={avatarUrl} />
      <LinkPending className="rounded-full" />
    </Link>
  );
}
