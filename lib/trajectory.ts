export type TraceEntry = {
  model: string; task: string; reward: number | null; score_status: string; run_status: string;
  available: boolean; reason?: string; file?: string; sha256?: string; bytes?: number; steps?: number;
  log_file?: string; log_sha256?: string; log_bytes?: number;
  source: { kind: string; id: number }; source_attempt_ids?: number[];
  live?: boolean; modified_at?: number; collection_warning?: boolean;
};
export type TraceManifest = { exported_at: string; score_observed_at: string; entries: TraceEntry[] };
export type Step = {
  step_id?: number; source?: string; timestamp?: string; message?: unknown; reasoning_content?: unknown;
  tool_calls?: { tool_call_id?: string; function_name?: string; arguments?: unknown }[];
  observation?: { results?: { source_call_id?: string; content?: unknown }[] };
  [key: string]: unknown;
};
export type Trajectory = { steps: Step[]; [key: string]: unknown };
export const rawText = (value: unknown): string => typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? '';

export async function loadOriginalText(url: string, sha256: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal });
  if (!response.ok || !response.body) throw new Error(`Trajectory request failed (${response.status}).`);
  const bytes = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const actual = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  if (actual !== sha256) throw new Error('Trajectory checksum does not match the exported record.');
  return new TextDecoder().decode(bytes);
}

export async function loadTrajectory(url: string, sha256: string, signal: AbortSignal): Promise<Trajectory> {
  const data = JSON.parse(await loadOriginalText(url, sha256, signal));
  if (!Array.isArray(data.steps)) throw new Error('This file does not contain an ATIF steps array.');
  return data;
}
