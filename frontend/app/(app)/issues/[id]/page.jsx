import IssueDetail from "@/components/Modules/Issues/IssueDetail";

// params is a Promise in this Next.js version, so it is awaited here in the server
// component and the resolved id is handed to the client component as a plain prop.
const IssueDetailPage = async ({ params }) => {
  const { id } = await params;

  return <IssueDetail issueId={id} />;
};

export default IssueDetailPage;
