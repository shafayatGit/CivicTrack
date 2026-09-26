import { Badge } from "@/components/ui/badge";
import { statusVariant } from "@/lib/issue-status";

const IssueStatusBadge = ({ status, className }) => (
  <Badge variant={statusVariant(status)} className={className}>
    {status}
  </Badge>
);

export default IssueStatusBadge;
