import { AlertCircle, Inbox } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const TableSkeleton = ({ rows = 4 }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }, (_, index) => (
      <Skeleton key={index} className="h-12 w-full" />
    ))}
  </div>
);

const ListSkeleton = ({ rows = 3 }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }, (_, index) => (
      <Skeleton key={index} className="h-20 w-full" />
    ))}
  </div>
);

// One place that decides what a collection renders while loading, when it failed,
// and when it came back empty — otherwise each screen re-implements the same three
// branches with slightly different markup.
const CollectionState = ({
  loading,
  error,
  isEmpty,
  skeleton = <TableSkeleton />,
  emptyTitle = "Nothing here yet",
  emptyDescription = "Records will appear here once they exist.",
  emptyIcon: EmptyIcon = Inbox,
  emptyAction,
  children,
}) => {
  if (loading) {
    return skeleton;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Could not load this data</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (isEmpty) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <EmptyIcon />
          </EmptyMedia>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
        {emptyAction}
      </Empty>
    );
  }

  return children;
};

export { ListSkeleton, TableSkeleton };
export default CollectionState;
