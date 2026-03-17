import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

export function NewORR() {
  const navigate = useNavigate();
  const [serviceName, setServiceName] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [repositoryToken, setRepositoryToken] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const data: Parameters<typeof api.orrs.create>[0] = { serviceName };
      if (repositoryUrl.trim()) {
        data.repositoryUrl = repositoryUrl.trim();
        if (repositoryToken.trim()) {
          data.repositoryToken = repositoryToken.trim();
        }
      }
      const res = await api.orrs.create(data);
      navigate(`/orrs/${res.orr.id}`);
    } catch (err) {
      setError((err as Error).message);
      setCreating(false);
    }
  };

  return (
    <div className="p-6 max-w-lg">
      <h2 className="text-xl font-bold text-gray-900 mb-6">New ORR</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700">Service Name</label>
          <input
            type="text"
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
            required
            placeholder="e.g., Payment Service, User Auth API"
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            The ORR will use the default template with 11 sections and 117 prompts from the book.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Repository URL
            <span className="text-gray-400 font-normal ml-1">(optional)</span>
          </label>
          <input
            type="url"
            value={repositoryUrl}
            onChange={(e) => setRepositoryUrl(e.target.value)}
            placeholder="https://github.com/org/repo"
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500 font-mono"
          />
          <p className="mt-1 text-xs text-gray-500">
            HTTPS git URL for the service's source code. During the review, the AI can search and read
            code when the team needs help finding specifics.
          </p>
        </div>

        {repositoryUrl.trim() && (
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Access Token
              <span className="text-gray-400 font-normal ml-1">(for private repos)</span>
            </label>
            <input
              type="password"
              value={repositoryToken}
              onChange={(e) => setRepositoryToken(e.target.value)}
              placeholder="ghp_... or glpat-..."
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500 font-mono"
            />
            <p className="mt-1 text-xs text-gray-500">
              Personal access token for private repositories. Encrypted at rest and never sent back to the browser.
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={creating}
          className="w-full py-2 px-4 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {creating ? "Creating..." : "Create ORR"}
        </button>
      </form>
    </div>
  );
}
