import type { ReconJob, ReconPipeline } from "../lib/types";

interface PipelinePanelProps {
  job: ReconJob | null;
  pipeline: ReconPipeline | null;
}

export function PipelinePanel({ job, pipeline }: PipelinePanelProps) {
  const effectivePipeline = job?.result?.pipeline ?? pipeline;

  return (
    <section className="panel space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="mono text-xs uppercase tracking-[0.32em] text-slate-500">Automation Engine</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-50">Passive recon pipeline</h2>
        </div>
        <span className="metric-pill">
          {job ? `${job.status} · ${job.progress}%` : effectivePipeline?.status ?? "idle"}
        </span>
      </div>

      {job ? (
        <div className="progress-shell">
          <div className="progress-bar" style={{ width: `${job.progress}%` }} />
        </div>
      ) : null}

      {job?.currentStage ? <div className="mono text-xs text-cyan-300">stage: {job.currentStage}</div> : null}

      {effectivePipeline ? (
        <div className="space-y-3">
          {effectivePipeline.stages.map((stage) => (
            <article className="pipeline-stage" key={stage.id}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-50">{stage.label}</div>
                  <p className="mt-2 text-xs leading-6 text-slate-400">{stage.description}</p>
                </div>
                <div className="text-right">
                  <div className={`status-tag status-${stage.status}`}>{stage.status}</div>
                  <div className="mono mt-2 text-xs text-slate-500">{stage.itemsDiscovered} items</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400">Launch a pipeline to watch passive recon stages complete in sequence.</p>
      )}
    </section>
  );
}

