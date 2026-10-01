const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

const TOKEN_KEY = "civictrack_token";

// `storage` only fires in *other* tabs, so a sign-in or sign-out in this tab would
// leave every other mounted component holding a stale session. Dispatching our own
// event alongside the write keeps same-tab listeners in step too.
const AUTH_EVENT = "civictrack:auth";

const emitAuthChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_EVENT));
  }
};

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const setToken = (token) => {
  localStorage.setItem(TOKEN_KEY, token);
  emitAuthChange();
};

export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  emitAuthChange();
};

export const AUTH_CHANGE_EVENT = AUTH_EVENT;

export const decodeToken = (token) => {
  if (!token) {
    return null;
  }

  try {
    const payload = token.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(
      decodeURIComponent(
        Array.from(atob(base64), (char) =>
          `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`,
        ).join(""),
      ),
    );
  } catch {
    return null;
  }
};

export class ApiRequestError extends Error {
  constructor(response, status) {
    super(response?.message ?? `Request failed with status ${status}`);
    this.status = status;
    this.response = response;
  }
}

// The current user, derived from the stored JWT. There is no /api/auth/me, so
// every role-aware screen reads this instead of round-tripping for a profile.
//
// auth.service.js signs { id, email, role } — the subject lives in a custom `id`
// claim, not the registered `sub` one, and no name is signed at all. `sub` is
// accepted first so a future move to the standard claim keeps working.
export const getSession = () => {
  const token = getToken();
  if (!token) {
    return null;
  }

  return sessionFromToken(token);
};

export const sessionFromToken = (token) => {
  const payload = decodeToken(token);
  const id = payload?.sub ?? payload?.id;

  if (!id) {
    return null;
  }

  return {
    token,
    id,
    // Nothing in the token carries a display name, so it falls back to the mailbox
    // name and finally to a generic label rather than rendering "undefined".
    name: payload.name ?? emailDisplayName(payload.email),
    email: payload.email ?? "",
    // A token without a role claim is treated as the least-privileged role, so a
    // malformed token can never read as an admin.
    role: payload.role ?? "citizen",
  };
};

const emailDisplayName = (email) => {
  if (!email) {
    return "Signed in";
  }

  const [localPart] = email.split("@");

  return localPart || "Signed in";
};

export const apiFetch = async (path, { body, headers, ...options } = {}) => {
  const requestHeaders = new Headers(headers);

  // FormData has to be handed to fetch untouched: the browser appends the multipart
  // boundary itself, and forcing a Content-Type here would either strip that
  // boundary (multer rejects the stream) or mislabel a JSON payload.
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (!isFormData && body !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const token = getToken();
  if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    // Required, not optional: the API is on a different origin (localhost:3000 vs
    // :8000), and the anonymous voter token arrives and leaves as an httpOnly cookie
    // the server sets. Without this the browser neither stores nor returns it, and
    // every vote would look like a brand new voter on each click. The server reflects
    // the origin and sets Access-Control-Allow-Credentials, so this is permitted.
    credentials: "include",
    headers: requestHeaders,
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiRequestError(data, response.status);
  }

  return data;
};

// Every paginated collection answers with the same envelope from
// utils/pagination.js, so the call sites should not each re-derive it.
const withQuery = (path, query) => {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }

  const search = params.toString();
  return search ? `${path}?${search}` : path;
};

// --- auth -------------------------------------------------------------------

export const registerUser = (payload) =>
  apiFetch("/api/auth/register", { method: "POST", body: payload });

export const loginUser = (payload) =>
  apiFetch("/api/auth/login", { method: "POST", body: payload });

// --- categories -------------------------------------------------------------

export const listCategories = () => apiFetch("/api/categories");

export const getCategory = (id) => apiFetch(`/api/categories/${id}`);

export const createCategory = (payload) =>
  apiFetch("/api/categories", { method: "POST", body: payload });

export const updateCategory = (id, payload) =>
  apiFetch(`/api/categories/${id}`, { method: "PUT", body: payload });

export const deleteCategory = (id) =>
  apiFetch(`/api/categories/${id}`, { method: "DELETE" });

// --- departments ------------------------------------------------------------

export const listDepartments = (query) =>
  apiFetch(withQuery("/api/departments", query));

export const getDepartment = (id) => apiFetch(`/api/departments/${id}`);

export const createDepartment = (payload) =>
  apiFetch("/api/departments", { method: "POST", body: payload });

export const updateDepartment = (id, payload) =>
  apiFetch(`/api/departments/${id}`, { method: "PUT", body: payload });

export const deleteDepartment = (id) =>
  apiFetch(`/api/departments/${id}`, { method: "DELETE" });

// --- wards ------------------------------------------------------------------

export const listWards = (query) => apiFetch(withQuery("/api/wards", query));

export const getWard = (id) => apiFetch(`/api/wards/${id}`);

export const createWard = (payload) =>
  apiFetch("/api/wards", { method: "POST", body: payload });

export const updateWard = (id, payload) =>
  apiFetch(`/api/wards/${id}`, { method: "PUT", body: payload });

export const deleteWard = (id) =>
  apiFetch(`/api/wards/${id}`, { method: "DELETE" });

// --- staff ------------------------------------------------------------------

export const listStaff = (query) => apiFetch(withQuery("/api/staff", query));

export const getStaff = (id) => apiFetch(`/api/staff/${id}`);

// The JWT carries users.id but never staff.id, and GET /api/staff/:id is keyed on
// the staff row, so a staff member's own profile has to be recovered by identity.
// listStaff searches name and email with LIKE, so the exact email is matched here
// rather than trusting the first row back.
export const getOwnStaffProfile = async (email) => {
  const response = await listStaff({ search: email, limit: 20 });
  return response.data?.find((row) => row.email === email) ?? null;
};

// Least-loaded-first roster for an issue's department, used by the assignment panel.
export const listAvailableStaff = (departmentId) =>
  apiFetch(withQuery("/api/staff/available", { departmentId }));

export const createStaff = (payload) =>
  apiFetch("/api/staff", { method: "POST", body: payload });

export const updateStaff = (id, payload) =>
  apiFetch(`/api/staff/${id}`, { method: "PUT", body: payload });

export const deleteStaff = (id) =>
  apiFetch(`/api/staff/${id}`, { method: "DELETE" });

// --- issues -----------------------------------------------------------------

export const listIssues = (query) => apiFetch(withQuery("/api/issues", query));

export const getIssue = (id) => apiFetch(`/api/issues/${id}`);

export const getIssueStats = () => apiFetch("/api/issues/stats");

// The citizen dashboard's own data. There is deliberately no userId argument: the
// backend reads the id from the JWT, so a citizen cannot ask for someone else's
// reports by editing a query value.
export const listMyIssues = (query) =>
  apiFetch(withQuery("/api/issues/mine", query));

export const getMyIssueStats = () => apiFetch("/api/issues/my-stats");

export const getResolvedSummary = (query) =>
  apiFetch(withQuery("/api/issues/reports/resolved-summary", query));

// Neighbouring open reports for the coordinates currently in the report form.
export const findDuplicateIssues = (query) =>
  apiFetch(withQuery("/api/issues/duplicates", query));

export const getIssueStatusHistory = (id) =>
  apiFetch(`/api/issues/${id}/status-history`);

export const createIssue = (payload) =>
  apiFetch("/api/issues", { method: "POST", body: payload });

export const updateIssue = (id, payload) =>
  apiFetch(`/api/issues/${id}`, { method: "PUT", body: payload });

// The officer's verdict that a report is not real. Separate from updateIssue because
// it is a moderation judgement with its own rules (staff only, and only on an issue
// assigned to them), not a workflow transition.
export const flagIssueAsInvalid = (id, payload) =>
  apiFetch(`/api/issues/${id}/invalid`, { method: "POST", body: payload });

// --- false reports ---------------------------------------------------------

// The admin moderation queue. The backend defaults status to 'pending', so omitting
// it asks for "what still needs a decision", which is the question this screen exists
// to answer.
export const listFalseReports = (query) =>
  apiFetch(withQuery("/api/false-reports", query));

// Upholding the flag: deactivates the citizen who filed the report.
export const deactivateCitizen = (flagId, payload) =>
  apiFetch(`/api/false-reports/${flagId}/deactivate`, { method: "POST", body: payload });

// Dismissing it: the officer was wrong, the report returns to the workflow.
export const dismissFalseReport = (flagId) =>
  apiFetch(`/api/false-reports/${flagId}/dismiss`, { method: "POST" });

// --- users -----------------------------------------------------------------

export const getUser = (id) => apiFetch(`/api/users/${id}`);

export const reactivateUser = (id) =>
  apiFetch(`/api/users/${id}/reactivate`, { method: "POST" });

// --- public participation: votes and comments ------------------------------
// None of these require a session. The vote identity rides on the httpOnly
// `ct_voter` cookie the server sets, which is why apiFetch sends credentials.

export const getVoteSummary = (id) => apiFetch(`/api/issues/${id}/vote`);

// Toggles: one call both casts and withdraws a vote, and answers with the new state
// AND the new count, so the button and the badge can never disagree.
export const toggleVote = (id) => apiFetch(`/api/issues/${id}/vote`, { method: "POST" });

export const listComments = (id, query) =>
  apiFetch(withQuery(`/api/issues/${id}/comments`, query));

// `authorName` is ignored by the server for a signed-in user — it always uses the
// account name — and only applies to an anonymous comment.
export const createComment = (id, payload) =>
  apiFetch(`/api/issues/${id}/comments`, { method: "POST", body: payload });

// Admin moderation, on a different URL from the public thread so the two cannot be
// confused for one another.
export const hideComment = (id, payload) =>
  apiFetch(`/api/moderation/comments/${id}/hide`, { method: "POST", body: payload });

export const restoreComment = (id) =>
  apiFetch(`/api/moderation/comments/${id}/restore`, { method: "POST" });

export const deleteComment = (id) =>
  apiFetch(`/api/moderation/comments/${id}`, { method: "DELETE" });


// --- issue photos -----------------------------------------------------------

export const listIssuePhotos = (issueId) =>
  apiFetch(`/api/issue-photos/issue/${issueId}`);

export const getIssuePhoto = (id) => apiFetch(`/api/issue-photos/${id}`);

export const addIssuePhotoByUrl = (payload) =>
  apiFetch("/api/issue-photos", { method: "POST", body: payload });

export const uploadIssuePhoto = ({ issueId, file }) => {
  const form = new FormData();
  form.append("issueId", issueId);
  form.append("photo", file);

  return apiFetch("/api/issue-photos/upload", { method: "POST", body: form });
};

export const deleteIssuePhoto = (id) =>
  apiFetch(`/api/issue-photos/${id}`, { method: "DELETE" });

// --- messages ---------------------------------------------------------------

export const listAdmins = () => apiFetch("/api/messages/admins");

export const listThreads = (query) => apiFetch(withQuery("/api/messages/threads", query));

export const getUnreadCount = () => apiFetch("/api/messages/unread-count");

export const getThreadMessages = (thread, query) =>
  apiFetch(withQuery("/api/messages/thread/messages", query), {
    method: "POST",
    body: thread,
  });

export const sendMessage = (payload) =>
  apiFetch("/api/messages", { method: "POST", body: payload });

export const markThreadRead = (thread) =>
  apiFetch("/api/messages/thread", { method: "POST", body: thread });
