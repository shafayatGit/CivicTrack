import IssuesExplorer from "@/components/Modules/Issues/IssuesExplorer";

export const metadata = {
  title: "Issue queue",
};

// Opens on Unassigned because that is the triage backlog: work nobody owns yet.
// The same explorer powers /issues, so the filters and pagination cannot drift.
const AdminIssuesPage = () => {
  return (
    <IssuesExplorer
      heading="Issue queue"
      description="Triage incoming reports, then open one to assign an officer or move its status."
      initialScope="unassigned"
    />
  );
};

export default AdminIssuesPage;
