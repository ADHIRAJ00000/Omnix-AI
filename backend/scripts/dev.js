import { spawn } from "node:child_process";

/**
 * Runs all five services in one terminal, each restarting on file changes.
 *
 * Why a script rather than five terminals: the services are only useful
 * together — a request crosses the gateway, auth and one worker — so reading
 * their logs interleaved in one place is how you actually follow a request.
 * Colour-coded prefixes keep them apart.
 *
 * Node's own --watch does the restarting, so there is no nodemon or concurrently
 * to install. One Ctrl-C stops everything, because a service left holding port
 * 8003 makes the next start fail with an error that looks unrelated.
 */
const SERVICES = [
  { name: "gateway", entry: "gateway/index.js", colour: "\x1b[36m" },
  { name: "auth", entry: "services/auth/index.js", colour: "\x1b[32m" },
  { name: "chat", entry: "services/chat/index.js", colour: "\x1b[33m" },
  { name: "agent", entry: "services/agent/index.js", colour: "\x1b[35m" },
  { name: "billing", entry: "services/billing/index.js", colour: "\x1b[34m" },
];

const RESET = "\x1b[0m";
const width = Math.max(...SERVICES.map((s) => s.name.length));

const children = SERVICES.map(({ name, entry, colour }) => {
  const child = spawn("node", ["--watch", entry], {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  const label = `${colour}${name.padEnd(width)}${RESET} │ `;

  const forward = (stream, target) => {
    let buffer = "";

    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");

      // The last element is whatever came after the final newline — an
      // incomplete line. Hold it until the rest of it arrives, so a prefix is
      // never printed into the middle of a log line.
      buffer = lines.pop() ?? "";

      for (const line of lines) target.write(`${label}${line}\n`);
    });
  };

  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);

  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      process.stdout.write(`${label}exited with code ${code}\n`);
    }
  });

  return child;
});

let stopping = false;

const stopAll = () => {
  if (stopping) return;
  stopping = true;

  process.stdout.write("\nstopping all services\n");
  for (const child of children) child.kill("SIGTERM");
};

process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);
