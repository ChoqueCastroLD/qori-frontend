import Account from "./Account";
import PublicProfile from "./PublicProfile";
import Skeleton from "./Skeleton";
import { useEffect, useState } from "react";

// Same URL (/u/:username) shows the full dashboard to its owner and a view-only
// public profile to everyone else.
export default function ProfileView({ username }: { username: string }) {
  const [me, setMe] = useState<any>(undefined);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMe(d?.user ?? null))
      .catch(() => setMe(null));
  }, []);

  if (me === undefined)
    return (
      <div className="mx-auto max-w-3xl px-5 py-10">
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );

  const isOwner = !!me?.username && me.username.toLowerCase() === username.toLowerCase();
  return isOwner ? <Account /> : <PublicProfile username={username} />;
}
