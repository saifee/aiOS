// Root startup file for Hostinger Node.js app (Passenger).
// Set this file as the "Application startup file". It launches the built API
// server, which also serves the exported frontend on the same domain.
require("./apps/api/dist/server.js");
