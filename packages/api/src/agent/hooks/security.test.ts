import { describe, it, expect } from "vitest";
import { isSensitivePath, sensitiveFileHook } from "./security.js";
import type { ToolLedger } from "../steering.js";

const emptyLedger: ToolLedger = { calls: [], currentIteration: 0 };

describe("isSensitivePath", () => {
  it.each([
    ".env",
    ".env.local",
    ".env.production",
    "config/.env",
    "server.pem",
    "tls/cert.key",
    "keystore.p12",
    "credentials.json",
    ".aws/config",
    ".ssh/id_rsa",
    "id_ed25519",
    "id_ecdsa",
    ".gnupg/secring",
  ])("blocks %s", (path) => {
    expect(isSensitivePath(path)).toBe(true);
  });

  it.each([
    "secret.yaml",
    "secrets.json",
    "token.json",
    "tokens.txt",
  ])("blocks secret/token files: %s", (path) => {
    expect(isSensitivePath(path)).toBe(true);
  });

  it.each([
    "src/index.ts",
    "package.json",
    "README.md",
    "src/config/database.ts",
    "src/environment.ts",
    "docker-compose.yml",
    "tsconfig.json",
  ])("allows %s", (path) => {
    expect(isSensitivePath(path)).toBe(false);
  });

  it("normalizes backslashes", () => {
    expect(isSensitivePath("config\\.env")).toBe(true);
    expect(isSensitivePath(".aws\\credentials")).toBe(true);
  });
});

describe("sensitiveFileHook", () => {
  it("blocks read_file on .env", () => {
    const result = sensitiveFileHook.beforeToolCall!(
      "read_file",
      { file_path: ".env" },
      emptyLedger,
    );
    expect(result.action).toBe("guide");
    expect(result.reason).toContain("sensitive");
  });

  it("blocks read_file on credentials.json", () => {
    const result = sensitiveFileHook.beforeToolCall!(
      "read_file",
      { file_path: "config/credentials.json" },
      emptyLedger,
    );
    expect(result.action).toBe("guide");
  });

  it("allows read_file on normal files", () => {
    const result = sensitiveFileHook.beforeToolCall!(
      "read_file",
      { file_path: "src/index.ts" },
      emptyLedger,
    );
    expect(result.action).toBe("proceed");
  });

  it("proceeds when file_path is missing", () => {
    const result = sensitiveFileHook.beforeToolCall!(
      "read_file",
      {},
      emptyLedger,
    );
    expect(result.action).toBe("proceed");
  });
});
