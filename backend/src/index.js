import "dotenv/config";
import http from "http";
import app from "./app.js";
import { initRealtime } from "./realtime/index.js";

const PORT = process.env.PORT || 8000;

// socket.io needs the underlying HTTP server, not the Express app — Express 5 exposes
// no hook for attaching a WebSocket upgrade handler to app.listen().
const server = http.createServer(app);

initRealtime(server);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
