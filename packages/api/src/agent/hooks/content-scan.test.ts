import { describe, it, expect } from "vitest";
import { codeResultScanHook, directoryFilterHook } from "./content-scan.js";

describe("codeResultScanHook", () => {
  const hook = codeResultScanHook;

  it("redacts private keys", () => {
    const input = `-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----`;
    const result = hook.afterToolResult!("read_file", {}, input);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("MIIEpAIBAAKCAQEA");
  });

  it("redacts certificates", () => {
    const input = `-----BEGIN CERTIFICATE-----\nMIIDdzCCAl+gAwI...\n-----END CERTIFICATE-----`;
    const result = hook.afterToolResult!("read_file", {}, input);
    expect(result).toContain("[REDACTED]");
  });

  it("redacts API keys", () => {
    const input = `API_KEY = sk-1234567890abcdefghijklmnop`;
    const result = hook.afterToolResult!("read_file", {}, input);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("sk-1234567890");
  });

  it("redacts OpenAI-style keys", () => {
    const input = `const key = "sk-abcdefghijklmnopqrstuvwx"`;
    const result = hook.afterToolResult!("read_file", {}, input);
    expect(result).toContain("[REDACTED]");
  });

  it("redacts Anthropic keys", () => {
    const input = `ANTHROPIC_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwx`;
    const result = hook.afterToolResult!("read_file", {}, input);
    expect(result).toContain("[REDACTED]");
  });

  it("redacts GitHub PATs", () => {
    const input = `token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij`;
    const result = hook.afterToolResult!("read_file", {}, input);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("ghp_");
  });

  it("redacts GitLab PATs", () => {
    const input = `GL_TOKEN=glpat-abcdefghij-klmnopqrst`;
    const result = hook.afterToolResult!("read_file", {}, input);
    expect(result).toContain("[REDACTED]");
  });

  it("redacts PASSWORD= patterns", () => {
    const input = `DATABASE_PASSWORD = my-secret-password-123`;
    const result = hook.afterToolResult!("read_file", {}, input);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("my-secret-password");
  });

  it("redacts AWS credentials", () => {
    const input = `AWS_SECRET_ACCESS_KEY = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`;
    const result = hook.afterToolResult!("read_file", {}, input);
    expect(result).toContain("[REDACTED]");
  });

  it("preserves non-sensitive content", () => {
    const input = `const PORT = 3000;\nconst HOST = "localhost";`;
    const result = hook.afterToolResult!("read_file", {}, input);
    expect(result).toBe(input);
  });

  it("truncates oversized results", () => {
    const large = "x".repeat(20 * 1024); // 20KB
    const result = hook.afterToolResult!("read_file", {}, large);
    expect(result.length).toBeLessThan(11 * 1024); // MAX_RESULT_SIZE + truncation message
    expect(result).toContain("[truncated]");
  });

  it("truncates JSON read_file content gracefully", () => {
    const content = "a".repeat(20 * 1024);
    const json = JSON.stringify({ content, path: "big-file.ts" });
    const result = hook.afterToolResult!("read_file", {}, json);
    const parsed = JSON.parse(result);
    expect(parsed.content).toContain("[truncated");
    expect(parsed.path).toBe("big-file.ts");
  });
});

describe("directoryFilterHook", () => {
  const hook = directoryFilterHook;

  it("filters sensitive entries from list_directory", () => {
    const input = JSON.stringify({
      entries: [
        { name: "src", type: "directory" },
        { name: ".env", type: "file" },
        { name: "package.json", type: "file" },
        { name: "credentials.json", type: "file" },
      ],
    });

    const result = hook.afterToolResult!("list_directory", { path: "." }, input);
    const parsed = JSON.parse(result);
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries.map((e: any) => e.name)).toEqual(["src", "package.json"]);
  });

  it("passes through when no sensitive entries", () => {
    const input = JSON.stringify({
      entries: [
        { name: "src", type: "directory" },
        { name: "README.md", type: "file" },
      ],
    });

    const result = hook.afterToolResult!("list_directory", { path: "." }, input);
    // Should be unchanged
    expect(result).toBe(input);
  });

  it("handles non-JSON input gracefully", () => {
    const input = "not json";
    const result = hook.afterToolResult!("list_directory", {}, input);
    expect(result).toBe(input);
  });
});
