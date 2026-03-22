const API_BASE = "/api/v1";

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message || `Request failed: ${res.status}`);
  }

  return res.json();
}

export const api = {
  // ORRs
  orrs: {
    list: () => request<{ orrs: any[] }>("/orrs"),
    get: (id: string) => request<{ orr: any; sections: any[] }>(`/orrs/${id}`),
    create: (data: { serviceName: string; templateId?: string; repositoryUrl?: string; repositoryToken?: string }) =>
      request<{ orr: any; sections: any[] }>("/orrs", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: { status?: string; serviceName?: string; repositoryUrl?: string; repositoryToken?: string; steeringTier?: string }) =>
      request<{ orr: any }>(`/orrs/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ deleted: boolean }>(`/orrs/${id}`, { method: "DELETE" }),
  },

  // Sections
  sections: {
    list: (orrId: string) =>
      request<{ sections: any[] }>(`/orrs/${orrId}/sections`),
    get: (orrId: string, sectionId: string) =>
      request<{ section: any }>(`/orrs/${orrId}/sections/${sectionId}`),
    update: (orrId: string, sectionId: string, data: { content?: string; prompts?: string[]; promptResponses?: Record<string, string> }) =>
      request<{ section: any }>(`/orrs/${orrId}/sections/${sectionId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },

  // Sessions
  sessions: {
    create: (orrId: string) =>
      request<{ session: any }>(`/orrs/${orrId}/sessions`, { method: "POST" }),
    list: (orrId: string) =>
      request<{ sessions: any[] }>(`/orrs/${orrId}/sessions`),
    getMessages: (orrId: string, sessionId: string) =>
      request<{ messages: any[] }>(`/orrs/${orrId}/sessions/${sessionId}/messages`),
    getAllMessages: (orrId: string) =>
      request<{ messages: any[] }>(`/orrs/${orrId}/sessions/all-messages`),
    end: (orrId: string, sessionId: string) =>
      request<{ ended: boolean }>(`/orrs/${orrId}/sessions/${sessionId}/end`, {
        method: "POST",
      }),
  },

  // Dashboard
  dashboard: {
    get: () => request<{ dashboard: any }>("/dashboard"),
  },

  // Flags
  flags: {
    list: (params?: { type?: string; severity?: string; orrId?: string; overdue?: boolean; status?: string }) => {
      const qs = new URLSearchParams();
      if (params?.type) qs.set("type", params.type);
      if (params?.severity) qs.set("severity", params.severity);
      if (params?.orrId) qs.set("orrId", params.orrId);
      if (params?.overdue) qs.set("overdue", "true");
      if (params?.status) qs.set("status", params.status);
      const query = qs.toString();
      return request<{ summary: any; flags: any[] }>(`/flags${query ? `?${query}` : ""}`);
    },
    updateStatus: (orrId: string, sectionId: string, flagIndex: number, data: { status: string; resolution?: string }) =>
      request<{ flag: any; flags: any[] }>(`/orrs/${orrId}/sections/${sectionId}/flags/${flagIndex}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },

  // Dependencies
  dependencies: {
    list: (orrId: string) =>
      request<{ dependencies: any[] }>(`/orrs/${orrId}/dependencies`),
    delete: (orrId: string, depId: string) =>
      request<{ deleted: boolean }>(`/orrs/${orrId}/dependencies/${depId}`, { method: "DELETE" }),
  },

  // Incidents
  incidents: {
    list: () => request<{ incidents: any[] }>("/incidents"),
    get: (id: string) =>
      request<{ incident: any; sections: any[]; timelineEvents: any[]; contributingFactors: any[]; actionItems: any[]; suggestions: any[] }>(`/incidents/${id}`),
    create: (data: { title: string; serviceName?: string; incidentDate?: string; severity?: string; incidentType?: string }) =>
      request<{ incident: any }>("/incidents", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Record<string, unknown>) =>
      request<{ incident: any }>(`/incidents/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/incidents/${id}`, { method: "DELETE" }),
  },

  // Incident sections
  incidentSections: {
    update: (incidentId: string, sectionId: string, data: { content?: string; prompts?: string[]; promptResponses?: Record<string, string> }) =>
      request<{ section: any }>(`/incidents/${incidentId}/sections/${sectionId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },

  // Incident sessions
  incidentSessions: {
    create: (incidentId: string) =>
      request<{ session: any }>(`/incidents/${incidentId}/sessions`, { method: "POST" }),
    list: (incidentId: string) =>
      request<{ sessions: any[] }>(`/incidents/${incidentId}/sessions`),
    getAllMessages: (incidentId: string) =>
      request<{ messages: any[] }>(`/incidents/${incidentId}/sessions/all-messages`),
    end: (incidentId: string, sessionId: string) =>
      request<{ ended: boolean }>(`/incidents/${incidentId}/sessions/${sessionId}/end`, {
        method: "POST",
      }),
  },

  // Experiments
  experiments: {
    list: (practiceType: string, practiceId: string) =>
      request<{ experiments: any[] }>(`/experiments?practiceType=${practiceType}&practiceId=${practiceId}`),
    update: (id: string, data: { status?: string; completedNotes?: string; dismissedReason?: string }) =>
      request<{ experiment: any }>(`/experiments/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },

  // Templates
  templates: {
    list: () => request<{ templates: any[] }>("/templates"),
  },

  // Teaching moments
  teachingMoments: {
    list: (params?: { q?: string; source?: string; sectionTag?: string }) => {
      const qs = new URLSearchParams();
      if (params?.q) qs.set("q", params.q);
      if (params?.source) qs.set("source", params.source);
      if (params?.sectionTag) qs.set("sectionTag", params.sectionTag);
      const query = qs.toString();
      return request<{ teachingMoments: any[] }>(
        `/teaching-moments${query ? `?${query}` : ""}`,
      );
    },
    get: (id: string) =>
      request<{ teachingMoment: any }>(`/teaching-moments/${id}`),
  },

  // Case studies
  caseStudies: {
    list: (params?: { q?: string; failureCategory?: string; sectionTag?: string }) => {
      const qs = new URLSearchParams();
      if (params?.q) qs.set("q", params.q);
      if (params?.failureCategory) qs.set("failureCategory", params.failureCategory);
      if (params?.sectionTag) qs.set("sectionTag", params.sectionTag);
      const query = qs.toString();
      return request<{ caseStudies: any[] }>(
        `/case-studies${query ? `?${query}` : ""}`,
      );
    },
    get: (id: string) =>
      request<{ caseStudy: any }>(`/case-studies/${id}`),
  },
};

/**
 * Send a message to an AI session and read SSE stream.
 * Aborts if no data received within 60 seconds.
 */
export async function sendMessage(
  orrId: string,
  sessionId: string,
  content: string,
  sectionId: string | null,
  onEvent: (event: any) => void,
): Promise<void> {
  const controller = new AbortController();
  let timeoutId = setTimeout(() => controller.abort(), 60_000);

  const res = await fetch(
    `${API_BASE}/orrs/${orrId}/sessions/${sessionId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, sectionId }),
      signal: controller.signal,
    },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || "Failed to send message");
  }
  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let hasContent = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Reset timeout on each chunk received
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => controller.abort(), 60_000);

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data:")) {
          try {
            const data = JSON.parse(line.slice(5).trim());
            if (data.type === "content_delta") hasContent = true;
            onEvent(data);

            // If we got a fatal error with no content, abort the stream
            // immediately instead of waiting for it to close
            if (data.type === "error" && !hasContent) {
              controller.abort();
              return;
            }
          } catch {
            // Skip malformed events
          }
        }
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Send a message to an incident AI session and read SSE stream.
 */
export async function sendIncidentMessage(
  incidentId: string,
  sessionId: string,
  content: string,
  sectionId: string | null,
  onEvent: (event: any) => void,
): Promise<void> {
  const controller = new AbortController();
  let timeoutId = setTimeout(() => controller.abort(), 60_000);

  const res = await fetch(
    `${API_BASE}/incidents/${incidentId}/sessions/${sessionId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, sectionId }),
      signal: controller.signal,
    },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || "Failed to send message");
  }
  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let hasContent = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => controller.abort(), 60_000);

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data:")) {
          try {
            const data = JSON.parse(line.slice(5).trim());
            if (data.type === "content_delta") hasContent = true;
            onEvent(data);

            if (data.type === "error" && !hasContent) {
              controller.abort();
              return;
            }
          } catch {
            // Skip malformed events
          }
        }
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
