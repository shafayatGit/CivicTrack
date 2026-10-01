import IssueDetail from "@/components/Modules/Issues/IssueDetail";

export const metadata = {
  title: "Issue",
  description:
    "Report details, public discussion, and votes. No account needed.",
};

// params is a Promise in this Next.js version, so it is awaited here in the server
// component and the resolved id is handed to the client component as a plain prop.
//
// This page lives under the (public) group, not (app), so it renders for a visitor with
// no session. The two groups can both contribute under /issues because they resolve to
// different paths: the list is (app)/issues and this is (public)/issues/[id].
const IssueDetailPage = async ({ params }) => {
  const { id } = await params;

  return <IssueDetail issueId={id} />;
};

export default IssueDetailPage;
