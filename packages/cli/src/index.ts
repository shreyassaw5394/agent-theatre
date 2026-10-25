// Library surface of the CLI package, used by the VS Code extension (and anyone embedding the server).
export { Theatre, type TheatreOptions } from "./server.js";
export { scanRepo, repoIdFor } from "./scan.js";
export { listSessions, sessionTitle, type SessionInfo } from "./sessions.js";
export { installHooks, uninstallHooks, hooksStatus, installPaths, type InstallPaths } from "./hooks/install.js";
export { claudeBinary } from "./server.js";
