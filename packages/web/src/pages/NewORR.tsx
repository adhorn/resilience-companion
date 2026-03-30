import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { CHANGE_TYPE_LABELS, type ChangeType } from "@orr/shared";
import { generateFeatureTemplate, countFeaturePrompts } from "@orr/shared";

type Step = "type" | "details" | "questions";

const CHANGE_TYPES = Object.entries(CHANGE_TYPE_LABELS) as [ChangeType, string][];

export function NewORR() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("type");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  // Shared fields
  const [orrType, setOrrType] = useState<"service" | "feature">("service");
  const [serviceName, setServiceName] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [repositoryToken, setRepositoryToken] = useState("");

  // Feature ORR fields
  const [changeTypes, setChangeTypes] = useState<ChangeType[]>([]);
  const [changeDescription, setChangeDescription] = useState("");
  const [parentOrrId, setParentOrrId] = useState("");
  const [parentOrrs, setParentOrrs] = useState<any[]>([]);

  // Question customization
  const [selectedSections, setSelectedSections] = useState<
    Array<{ title: string; prompts: string[]; enabled: boolean }>
  >([]);

  // Load existing ORRs for parent selection
  useEffect(() => {
    api.orrs.list().then((res) => {
      setParentOrrs(
        res.orrs.filter(
          (o: any) => o.orrType !== "feature" && o.status !== "TERMINATED" && o.status !== "ARCHIVED",
        ),
      );
    });
  }, []);

  // Generate preview sections when change types change
  useEffect(() => {
    if (orrType !== "feature" || changeTypes.length === 0) return;
    const template = generateFeatureTemplate(changeTypes);
    setSelectedSections(
      template.map((s) => ({ title: s.title, prompts: s.prompts, enabled: true })),
    );
  }, [changeTypes, orrType]);

  const featureCounts = useMemo(() => {
    if (changeTypes.length === 0) return { sections: 0, prompts: 0 };
    return countFeaturePrompts(changeTypes);
  }, [changeTypes]);

  const enabledSections = selectedSections.filter((s) => s.enabled);

  const toggleChangeType = (ct: ChangeType) => {
    setChangeTypes((prev) =>
      prev.includes(ct) ? prev.filter((t) => t !== ct) : [...prev, ct],
    );
  };

  const canProceedFromType = orrType === "service" || orrType === "feature";

  const canProceedFromDetails =
    serviceName.trim().length > 0 &&
    (orrType === "service" || (changeTypes.length > 0 && changeDescription.trim().length > 0));

  const handleCreate = async () => {
    setError("");
    setCreating(true);
    try {
      const data: Parameters<typeof api.orrs.create>[0] = {
        serviceName: serviceName.trim(),
        orrType,
      };

      if (repositoryUrl.trim()) {
        data.repositoryUrl = repositoryUrl.trim();
        if (repositoryToken.trim()) {
          data.repositoryToken = repositoryToken.trim();
        }
      }

      if (orrType === "feature") {
        data.changeTypes = changeTypes;
        data.changeDescription = changeDescription.trim();
        if (parentOrrId) data.parentOrrId = parentOrrId;
        if (enabledSections.length > 0) {
          data.selectedSections = enabledSections.map((s) => ({
            title: s.title,
            prompts: s.prompts,
          }));
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
    <div className="p-6 max-w-2xl">
      <h2 className="text-xl font-bold text-gray-900 mb-1">New ORR</h2>
      <p className="text-sm text-gray-500 mb-6">
        {step === "type" && "Choose the type of review"}
        {step === "details" && (orrType === "service" ? "Service details" : "Feature change details")}
        {step === "questions" && "Review and customize questions"}
      </p>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-2 rounded mb-4">{error}</div>
      )}

      {/* Step 1: Type Selection */}
      {step === "type" && (
        <div className="space-y-4">
          <button
            onClick={() => { setOrrType("service"); setStep("details"); }}
            className="w-full text-left p-4 border-2 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <div className="font-semibold text-gray-900">Service ORR</div>
            <div className="text-sm text-gray-500 mt-1">
              Full operational readiness review — 11 sections, 117 prompts covering architecture,
              failures, monitoring, deployment, and more.
            </div>
            <div className="text-xs text-gray-400 mt-2">
              Best for: new services going to production, or periodic re-reviews of existing services.
            </div>
          </button>

          <button
            onClick={() => { setOrrType("feature"); setStep("details"); }}
            className="w-full text-left p-4 border-2 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <div className="font-semibold text-gray-900">Feature ORR</div>
            <div className="text-sm text-gray-500 mt-1">
              Lightweight, change-scoped review — questions are tailored to the specific changes
              you're making. Typically 2-4 sections, 15-30 prompts.
            </div>
            <div className="text-xs text-gray-400 mt-2">
              Best for: adding dependencies, new endpoints, schema migrations, scaling changes, or
              security boundary shifts.
            </div>
          </button>
        </div>
      )}

      {/* Step 2: Details */}
      {step === "details" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Service Name</label>
            <input
              type="text"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              placeholder="e.g., Payment Service, User Auth API"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {orrType === "feature" && (
            <>
              {/* Change types */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  What kind of changes? <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {CHANGE_TYPES.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => toggleChangeType(value)}
                      className={`text-left px-3 py-2 rounded border text-sm transition-colors ${
                        changeTypes.includes(value)
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {changeTypes.length > 0 && (
                  <p className="mt-2 text-xs text-gray-500">
                    This will generate ~{featureCounts.sections} sections with ~{featureCounts.prompts} questions.
                  </p>
                )}
              </div>

              {/* Change description */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Describe the change <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={changeDescription}
                  onChange={(e) => setChangeDescription(e.target.value)}
                  placeholder="e.g., Adding Redis as a session cache to replace in-memory sessions. This introduces a new external dependency and changes our failure domain..."
                  rows={3}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  The AI will use this to focus its questions during the review.
                </p>
              </div>

              {/* Parent ORR */}
              {parentOrrs.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Parent Service ORR
                    <span className="text-gray-400 font-normal ml-1">(optional)</span>
                  </label>
                  <select
                    value={parentOrrId}
                    onChange={(e) => setParentOrrId(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">None — standalone feature review</option>
                    {parentOrrs.map((o: any) => (
                      <option key={o.id} value={o.id}>
                        {o.serviceName} ({o.status.replace(/_/g, " ")})
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Link to the parent service ORR so the AI can check your change against what was established.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Repository URL */}
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
              The AI can search and read code during the review.
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
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => { setStep("type"); setOrrType("service"); }}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Back
            </button>
            <button
              onClick={() => {
                if (orrType === "feature" && changeTypes.length > 0) {
                  setStep("questions");
                } else {
                  handleCreate();
                }
              }}
              disabled={!canProceedFromDetails || creating}
              className="flex-1 py-2 px-4 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {orrType === "service"
                ? creating ? "Creating..." : "Create Service ORR"
                : changeTypes.length > 0
                  ? "Review Questions"
                  : "Select change types"}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Question Review (feature ORR only) */}
      {step === "questions" && (
        <div className="space-y-4">
          <div className="text-sm text-gray-600 bg-gray-50 rounded p-3">
            {enabledSections.length} sections, {enabledSections.reduce((sum, s) => sum + s.prompts.length, 0)} questions selected.
            Toggle sections on/off to customize.
          </div>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {selectedSections.map((section, si) => (
              <div key={si} className={`border rounded-lg ${section.enabled ? "border-gray-200" : "border-gray-100 opacity-50"}`}>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedSections((prev) =>
                      prev.map((s, i) => (i === si ? { ...s, enabled: !s.enabled } : s)),
                    )
                  }
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                >
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      section.enabled ? "border-blue-500 bg-blue-500" : "border-gray-300"
                    }`}
                  >
                    {section.enabled && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-sm text-gray-900">{section.title}</div>
                    <div className="text-xs text-gray-500">{section.prompts.length} questions</div>
                  </div>
                </button>
                {section.enabled && (
                  <div className="px-4 pb-3 border-t border-gray-100">
                    <ul className="mt-2 space-y-1">
                      {section.prompts.map((p, pi) => (
                        <li key={pi} className="text-xs text-gray-600 pl-3 border-l-2 border-gray-200 py-0.5">
                          {p.length > 120 ? p.slice(0, 120) + "..." : p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setStep("details")}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Back
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || enabledSections.length === 0}
              className="flex-1 py-2 px-4 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? "Creating..." : `Create Feature ORR (${enabledSections.reduce((sum, s) => sum + s.prompts.length, 0)} questions)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
