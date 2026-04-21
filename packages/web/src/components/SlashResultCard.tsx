/**
 * Renders structured slash command results as formatted cards.
 * Replaces raw markdown/JSON for write slash commands.
 */
import type { SlashCommandResult, SlashExperiment, SlashDependency, SlashDiscovery, SlashActionItem, SlashTimelineEvent, SlashContributingFactor } from "@orr/shared";

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-gray-100 text-gray-700",
};

const TYPE_LABELS: Record<string, string> = {
  chaos_experiment: "Chaos Experiment",
  load_test: "Load Test",
  gameday: "GameDay",
  technical: "Technical",
  process: "Process",
  organizational: "Organizational",
  learning: "Learning",
};

function Badge({ text, className }: { text: string; className?: string }) {
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${className || "bg-gray-100 text-gray-600"}`}>
      {text}
    </span>
  );
}

function ExperimentCards({ items }: { items: SlashExperiment[] }) {
  return (
    <div className="space-y-2">
      {items.map((exp, i) => (
        <div key={i} className="border rounded-md p-3 bg-white">
          <div className="flex items-center gap-2 mb-1">
            <Badge text={TYPE_LABELS[exp.type] || exp.type} className="bg-blue-100 text-blue-800" />
            <Badge text={exp.priority} className={PRIORITY_COLORS[exp.priority]} />
          </div>
          <div className="font-medium text-sm mb-1">{exp.title}</div>
          <div className="text-xs text-gray-600 mb-1">
            <span className="font-medium">Hypothesis:</span> {exp.hypothesis}
          </div>
          <div className="text-xs text-gray-500">{exp.rationale}</div>
        </div>
      ))}
    </div>
  );
}

function DependencyCards({ items }: { items: SlashDependency[] }) {
  return (
    <div className="space-y-1.5">
      {items.map((dep, i) => (
        <div key={i} className="flex items-center gap-2 border rounded-md px-3 py-2 bg-white">
          <Badge text={dep.type} className="bg-purple-100 text-purple-800" />
          <span className="font-medium text-sm">{dep.name}</span>
          <Badge text={dep.criticality} className={dep.criticality === "critical" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-600"} />
          {dep.notes && <span className="text-xs text-gray-500 ml-auto">{dep.notes}</span>}
        </div>
      ))}
    </div>
  );
}

function DiscoveryCards({ items }: { items: SlashDiscovery[] }) {
  return (
    <div className="space-y-1.5">
      {items.map((disc, i) => (
        <div key={i} className="border-l-2 border-amber-400 pl-3 py-1">
          <div className="text-sm">{disc.text}</div>
        </div>
      ))}
    </div>
  );
}

function ActionItemCards({ items }: { items: SlashActionItem[] }) {
  return (
    <div className="space-y-1.5">
      {items.map((ai, i) => (
        <div key={i} className="flex items-center gap-2 border rounded-md px-3 py-2 bg-white">
          <Badge text={TYPE_LABELS[ai.type] || ai.type} className="bg-green-100 text-green-800" />
          <span className="text-sm">{ai.title}</span>
          {ai.priority && <Badge text={ai.priority} className={PRIORITY_COLORS[ai.priority]} />}
          {ai.owner && <span className="text-xs text-gray-500 ml-auto">{ai.owner}</span>}
        </div>
      ))}
    </div>
  );
}

function TimelineCards({ items }: { items: SlashTimelineEvent[] }) {
  return (
    <div className="space-y-1.5">
      {items.map((te, i) => (
        <div key={i} className="flex gap-3 border-l-2 border-blue-300 pl-3 py-1">
          <div className="text-[10px] text-gray-400 font-mono whitespace-nowrap">{te.timestamp}</div>
          <div>
            <div className="text-sm">{te.description}</div>
            {te.actor && <div className="text-xs text-gray-500">{te.actor}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function FactorCards({ items }: { items: SlashContributingFactor[] }) {
  return (
    <div className="space-y-1.5">
      {items.map((cf, i) => (
        <div key={i} className="border rounded-md px-3 py-2 bg-white">
          <div className="flex items-center gap-2 mb-1">
            <Badge text={cf.category} className="bg-red-100 text-red-800" />
            {cf.is_systemic && <Badge text="systemic" className="bg-orange-100 text-orange-800" />}
          </div>
          <div className="text-sm">{cf.description}</div>
        </div>
      ))}
    </div>
  );
}

const COMMAND_TITLES: Record<string, string> = {
  experiments: "Experiment Suggestions",
  dependencies: "Dependencies",
  learning: "Learning Signals",
  actions: "Action Items",
  timeline: "Incident Timeline",
  factors: "Contributing Factors",
};

export function SlashResultCard({ result }: { result: SlashCommandResult }) {
  const title = COMMAND_TITLES[result.command] || result.command;

  return (
    <div className="my-2">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{title}</div>
      {result.summary && <p className="text-sm text-gray-700 mb-2">{result.summary}</p>}
      {result.items.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No items to report.</p>
      ) : (
        <>
          {result.command === "experiments" && <ExperimentCards items={result.items as SlashExperiment[]} />}
          {result.command === "dependencies" && <DependencyCards items={result.items as SlashDependency[]} />}
          {result.command === "learning" && <DiscoveryCards items={result.items as SlashDiscovery[]} />}
          {result.command === "actions" && <ActionItemCards items={result.items as SlashActionItem[]} />}
          {result.command === "timeline" && <TimelineCards items={result.items as SlashTimelineEvent[]} />}
          {result.command === "factors" && <FactorCards items={result.items as SlashContributingFactor[]} />}
        </>
      )}
      {result.items.length > 0 && (
        <p className="text-[10px] text-gray-400 mt-2">{result.items.length} item(s) recorded</p>
      )}
    </div>
  );
}
