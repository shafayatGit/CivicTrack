import MessagesView from "@/components/Modules/Messages/MessagesView";

export const metadata = {
  title: "Messages",
};

// No middleware in this app and the token lives in localStorage, so the staff/admin
// gate cannot run on the server — MessagesView checks the role and renders nothing
// for a citizen, matching the backend module's own requireRole('staff', 'admin').
const MessagesPage = () => {
  return <MessagesView />;
};

export default MessagesPage;
