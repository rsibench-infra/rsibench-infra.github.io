'use client';
import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Bubble } from '@ant-design/x';
import { Alert, Collapse, ConfigProvider, Pagination, Spin } from 'antd';
import { Bot, User, X, Download, Search } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { loadOriginalText, loadTrajectory, rawText, type Step, type TraceEntry, type TraceManifest, type Trajectory } from '@/lib/trajectory';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
const pageSize = 20;
export type TraceFocus = { model: string; modelId: string; task: string; reward: number | null; status: string };

function StepContent({ step }: { step: Step }) {
  const calls = step.tool_calls || [];
  const results = step.observation?.results || [];
  return <>
    {Boolean(step.message) && <div className="trace-markdown"><Markdown remarkPlugins={[remarkGfm]} components={{
      // Stored messages are untrusted: no embedded HTML, remote images, or automatic requests.
      img: ({ alt }) => <span>[Image: {alt || 'attachment'}]</span>,
      a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>,
    }}>{rawText(step.message)}</Markdown></div>}
    <Collapse size="small" ghost destroyOnHidden items={[
      ...(step.reasoning_content ? [{ key: 'reasoning', label: 'Reasoning', children: <pre>{rawText(step.reasoning_content)}</pre> }] : []),
      ...calls.map((call, i) => ({ key: `call-${i}`, label: `Tool · ${call.function_name || 'Unknown tool'}`, children: <>
        <div className="trace-detail-label">Arguments · {call.tool_call_id}</div><pre>{rawText(call.arguments)}</pre>
        {results.filter(r => r.source_call_id && r.source_call_id === call.tool_call_id).map((r, j) => <div key={j}><div className="trace-detail-label">Output</div><pre>{rawText(r.content)}</pre></div>)}
      </> })),
      ...results.filter(r => !r.source_call_id || !calls.some(c => c.tool_call_id === r.source_call_id)).map((r, i) => ({ key: `result-${i}`, label: `Tool output${r.source_call_id ? ` · ${r.source_call_id}` : ''}`, children: <pre>{rawText(r.content)}</pre> })),
      { key: 'raw', label: 'Raw step · all fields', children: <pre>{rawText(step)}</pre> },
    ]}/>
  </>;
}

export default function TrajectoryViewer({ focus, onClose }: { focus: TraceFocus; onClose: () => void }) {
  const [trigger] = useState(() => document.querySelector<HTMLButtonElement>('button.score[data-trace-selected="true"]'));
  const [entry, setEntry] = useState<TraceEntry>();
  const [trace, setTrace] = useState<Trajectory>();
  const [log, setLog] = useState('');
  const [exportedAt, setExportedAt] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setTrace(undefined); setEntry(undefined); setLog('');
    (async () => {
      try {
        const response = await fetch(`${base}/data/trajectories/index.json`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Trajectory index request failed (${response.status}).`);
        const manifest: TraceManifest = await response.json();
        const item = manifest.entries.find(e => e.model === focus.modelId && e.task === focus.task);
        if (!item) throw new Error('This model/task pair is not in the trajectory export.');
        if (item.reward !== focus.reward || item.score_status !== focus.status) throw new Error('The trajectory index belongs to a different score snapshot.');
        if (controller.signal.aborted) return;
        setEntry(item); setExportedAt(manifest.exported_at);
        if (item.available) {
          if (!item.file || !/^[a-f0-9]{64}\.json\.gz$/.test(item.file) || !item.sha256) throw new Error('Invalid trajectory file reference.');
          const data = await loadTrajectory(`${base}/data/trajectories/${item.file}`, item.sha256, controller.signal);
          if (!controller.signal.aborted) setTrace(data);
        } else if (item.log_file && item.log_sha256) {
          if (!/^[a-f0-9]{64}\.txt\.gz$/.test(item.log_file)) throw new Error('Invalid log file reference.');
          const text = await loadOriginalText(`${base}/data/trajectories/${item.log_file}`, item.log_sha256, controller.signal);
          if (!controller.signal.aborted) setLog(text);
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load this trajectory.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [focus.modelId, focus.task, focus.reward, focus.status, retry]);
  const indexedSteps = useMemo(() => (trace?.steps || []).map((step, index) => ({ step, index, search: rawText(step).toLowerCase() })), [trace]);
  const filtered = useMemo(() => indexedSteps.filter(s => !query.trim() || s.search.includes(query.trim().toLowerCase())), [indexedSteps, query]);
  const shown = filtered.slice((page - 1) * pageSize, page * pageSize);
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal>
    <Dialog.Overlay className="trace-overlay"/>
    <Dialog.Content className="trace-dialog" onCloseAutoFocus={event => { event.preventDefault(); trigger?.focus(); }}>
      <div className="trace-heading"><div><div className="section-kicker">AGENT TRAJECTORY</div><Dialog.Title>{focus.model}</Dialog.Title><Dialog.Description>{focus.task}</Dialog.Description></div><Dialog.Close className="trace-close" aria-label="Close trajectory"><X size={20}/></Dialog.Close></div>
      <div className="trace-summary" role="status"><strong>{focus.reward === null ? 'No verified score' : `${focus.reward.toFixed(6)}×`}</strong><span>Score snapshot: {focus.status}</span>{entry && <span>Source: {entry.source.kind} {entry.source.id} · {entry.run_status}{(entry.source_attempt_ids?.length || 0) > 1 ? ` → Agent attempt ${entry.source_attempt_ids!.at(-1)}` : ''}</span>}</div>
      <ConfigProvider theme={{ token: { colorPrimary: '#5579cc', fontFamily: 'Inter, sans-serif', borderRadius: 6 } }}>
        {loading && <div className="trace-empty" role="status"><Spin/><p>Loading original trajectory…</p></div>}
        {error && <div className="trace-empty"><Alert type="error" title="Unable to load trajectory" description={error}/><button className="button" onClick={() => setRetry(n => n + 1)}>Retry</button></div>}
        {!loading && !error && entry && !trace && <div className="trace-empty"><Alert type="info" title="Trajectory unavailable" description={entry.reason}/>{entry.log_file && <div className="trace-fallback"><p>The original Agent log is available below. It is not an ATIF conversation.</p><a className="text-link" href={`${base}/data/trajectories/${entry.log_file}`} download><Download size={15}/> Original agent log (.gz)</a><Collapse size="small" destroyOnHidden items={[{ key: 'log', label: 'Read original Agent log', children: <pre>{log}</pre> }]}/></div>}</div>}
        {trace && <>
          <div className="trace-toolbar"><label className="search"><Search size={15}/><input aria-label="Search trajectory" placeholder="Search messages and tools…" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }}/></label><span>{filtered.length} / {trace.steps.length} steps</span><a className="text-link" href={`${base}/data/trajectories/${entry!.file}`} download><Download size={15}/> Original JSON (.gz)</a></div>
          {(entry?.live || entry?.collection_warning) && <Alert type="warning" title={entry.live ? 'Snapshot of an ongoing run; this trajectory may be incomplete.' : 'The source reports collection issues; this trajectory may be incomplete.'}/>}
          <div className="trace-messages" key={`${page}-${query}`}>
            {shown.length ? <Bubble.List autoScroll={false} items={shown.map(({ step, index }) => ({
              key: index, role: step.source === 'user' ? 'user' : 'ai',
              placement: 'start', variant: step.source === 'user' ? 'filled' : 'outlined',
              avatar: step.source === 'user' ? <User size={18}/> : <Bot size={18}/>,
              header: <span className="trace-step-label">{step.source || 'Unknown'} · Step {step.step_id ?? index + 1}{step.timestamp ? ` · ${step.timestamp}` : ''}</span>,
              content: <StepContent step={step}/>, styles: { body: { minWidth: 0, width: '100%' }, content: { minWidth: 0, width: '100%' } },
            }))}/> : <p className="trace-empty">{trace.steps.length ? 'No steps match your search.' : 'The saved trajectory contains no steps.'}</p>}
          </div>
          <div className="trace-pagination"><Pagination current={page} pageSize={pageSize} total={filtered.length} showSizeChanger={false} size="small" onChange={setPage}/></div>
          <div className="trace-provenance">Exported {exportedAt.replace('T', ' ').slice(0, 19)} UTC · Original ATIF file, SHA-256 verified.<Collapse ghost size="small" destroyOnHidden items={[{ key: 'metadata', label: 'Trajectory metadata & checksum', children: <><code>{entry?.sha256}</code><pre>{rawText(Object.fromEntries(Object.entries(trace).filter(([key]) => key !== 'steps')))}</pre></> }]}/></div>
        </>}
      </ConfigProvider>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
