import { Skeleton } from "@/components/ui";

/** Shown at once when an admin screen is opened, while the server reads its data. */
export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-28 w-full rounded-lg" />
      <Skeleton className="h-72 w-full rounded-lg" />
    </div>
  );
}
