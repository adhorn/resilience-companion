import React, { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";

interface Token {
  id: string;
  name: string;
  tokenPrefix: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export function Settings() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTokenName, setNewTokenName] = useState("");
  const [expiryDays, setExpiryDays] = useState(90);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const loadTokens = useCallback(async () => {
    try {
      const data = await api.tokens.list();
      setTokens(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTokenName.trim()) return;
    setCreating(true);
    try {
      const result = await api.tokens.create({
        name: newTokenName.trim(),
        expiryDays,
      });
      setCreatedToken(result.token);
      setNewTokenName("");
      await loadTokens();
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await api.tokens.revoke(id);
      await loadTokens();
    } catch {
      // ignore
    }
  };

  const activeTokens = tokens.filter((t) => !t.revokedAt);
  const revokedTokens = tokens.filter((t) => t.revokedAt);

  return (
    <div className="p-6 max-w-3xl">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Settings</h2>
      <p className="text-sm text-gray-500 mb-6">
        Manage API tokens for programmatic access (Slack bot, MCP server, scripts).
      </p>

      {/* Create token form */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Create API Token</h3>
        <form onSubmit={handleCreate} className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs text-gray-600 mb-1">Token name</label>
            <input
              type="text"
              value={newTokenName}
              onChange={(e) => setNewTokenName(e.target.value)}
              placeholder="e.g. Slack bot, MCP server"
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="w-32">
            <label className="block text-xs text-gray-600 mb-1">Expires in (days)</label>
            <input
              type="number"
              value={expiryDays}
              onChange={(e) => setExpiryDays(Number(e.target.value))}
              min={0}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={creating || !newTokenName.trim()}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Create
          </button>
        </form>
        <p className="text-xs text-gray-400 mt-2">Set days to 0 for a token that never expires.</p>
      </div>

      {/* Show newly created token */}
      {createdToken && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <p className="text-sm font-medium text-green-800 mb-2">
            Token created. Copy it now — you won't see it again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white border border-green-300 rounded px-3 py-2 font-mono select-all">
              {createdToken}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(createdToken);
              }}
              className="px-3 py-2 text-xs bg-green-600 text-white rounded hover:bg-green-700"
            >
              Copy
            </button>
          </div>
          <button
            onClick={() => setCreatedToken(null)}
            className="mt-2 text-xs text-green-700 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Active tokens */}
      {loading ? (
        <p className="text-sm text-gray-400">Loading tokens...</p>
      ) : (
        <>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">
            Active Tokens ({activeTokens.length})
          </h3>
          {activeTokens.length === 0 ? (
            <p className="text-sm text-gray-400 mb-6">No active tokens.</p>
          ) : (
            <table className="w-full text-sm mb-6">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="pb-2">Name</th>
                  <th className="pb-2">Prefix</th>
                  <th className="pb-2">Created</th>
                  <th className="pb-2">Expires</th>
                  <th className="pb-2">Last used</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {activeTokens.map((t) => (
                  <tr key={t.id} className="border-b border-gray-100">
                    <td className="py-2 font-medium">{t.name}</td>
                    <td className="py-2 font-mono text-xs text-gray-500">{t.tokenPrefix}...</td>
                    <td className="py-2 text-gray-500">{formatDate(t.createdAt)}</td>
                    <td className="py-2 text-gray-500">
                      {t.expiresAt ? formatDate(t.expiresAt) : "Never"}
                    </td>
                    <td className="py-2 text-gray-500">
                      {t.lastUsedAt ? formatDate(t.lastUsedAt) : "Never"}
                    </td>
                    <td className="py-2">
                      <button
                        onClick={() => handleRevoke(t.id)}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Revoked tokens */}
          {revokedTokens.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-gray-400 mb-2">
                Revoked ({revokedTokens.length})
              </h3>
              <table className="w-full text-sm text-gray-400">
                <tbody>
                  {revokedTokens.map((t) => (
                    <tr key={t.id} className="border-b border-gray-50">
                      <td className="py-1.5 line-through">{t.name}</td>
                      <td className="py-1.5 font-mono text-xs">{t.tokenPrefix}...</td>
                      <td className="py-1.5">Revoked {formatDate(t.revokedAt!)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
