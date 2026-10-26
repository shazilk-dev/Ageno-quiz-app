import { Container } from "@/components/layout/Container";
import { Skeleton } from "@/components/ui";

/** Shown at once when one of a person's pages is opened, while the server reads their data. */
export default function UserLoading() {
  return (
    <div data-theme="dark" className="flex-1 bg-bg text-text">
      <Container aria-busy="true" aria-label="Loading" className="space-y-4 py-8 sm:py-10">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </Container>
    </div>
  );
}
