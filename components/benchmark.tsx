'use client';
import { useState } from 'react';
import { normalizationHtml } from '@/lib/normalization';
import dynamic from 'next/dynamic';
import type { TraceFocus } from './trajectory-viewer';
const TrajectoryViewer = dynamic(() => import('./trajectory-viewer'), { ssr: false });
import * as Tabs from '@radix-ui/react-tabs';
import * as Tooltip from '@radix-ui/react-tooltip';
import { ArrowUpRight, ArrowDown, Github, Search, ArrowRight, Layers3, SlidersHorizontal, Check } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, Cell, ReferenceLine, LabelList, Rectangle } from 'recharts';
import snapshot from '@/data/leaderboard.json';
import liteSet from '@/data/lite-set.json';

const identities: Record<string, { color: string; icon: string }> = {
  'gpt-6-astra': { color: '#303030', icon: 'openai' },
  'deepseek-v4-flash': { color: '#4d6bfe', icon: 'deepseek-color' },
  'claude-opus-5-5': { color: '#d97757', icon: 'claude-color' },
  'glm-5.3': { color: '#586174', icon: 'zai' },
  'qwen3.8-max': { color: '#082dff', icon: 'qwen-color' },
  'seed-evolving-auto': { color: '#00a5b0', icon: 'bytedance-color' },
  'kimi-k3': { color: '#1783ff', icon: 'kimi-color' },
};
const labels: Record<string,string> = { 'gpt-6-astra':'GPT-6 Astra', 'deepseek-v4-flash':'DeepSeek V4 Flash', 'claude-opus-5-5':'Claude Opus 5.5', 'glm-5.3':'GLM-5.3', 'qwen3.8-max':'Qwen3.8 Max', 'seed-evolving-auto':'Seed Evolving Auto', 'kimi-k3':'Kimi K3' };
const models = snapshot.rows.map((r) => ({...r, name:labels[r.display_name] || r.display_name, color:identities[r.display_name]?.color || '#6f819c', icon:identities[r.display_name]?.icon}));
const liteModels = liteSet.models.map(model => ({ ...model, name: labels[model.display_name] || model.display_name, ...identities[model.display_name] })).sort((a,b)=>b.mean_score-a.mean_score);
const liteDomain = [Math.min(0, Math.floor(Math.min(...liteModels.map(model => model.mean_score)) * 5) / 5), Math.ceil((Math.max(1, ...liteModels.map(model => model.mean_score)) + 0.1) * 5) / 5];
// One scale across workloads preserves cross-task comparisons, including scores above SOL.
const liteTaskScores = liteModels.flatMap(model => model.tasks.map(task => task.score));
const liteTaskDomain = [Math.min(0, Math.floor(Math.min(...liteTaskScores) * 2) / 2), Math.ceil(Math.max(1, ...liteTaskScores) * 2) / 2];
const tasks = models[0].tasks.map(t=>t.task);
const taskNames = ['DeepSeek V4 Flash','GLM-5.2','GLM-5.3','GLM-5.3 Flash','Inkling','Kimi K3','LingBot World 2.0','LLaDA 2.1 Mini','MiniMax H3','Muse Glimmer','Nemotron 3 Ultra','π0.5 LIBERO','Qwen3.8','Qwen3 TTS','Qwen3-VL','Wan 2.2','Qwen3 · GRPO','Qwen3 · SFT','Qwen3 · OPD','Qwen3-VL · GRPO'];
const github = process.env.NEXT_PUBLIC_PROJECT_GITHUB || '';
function CodeLink({children, className}: {children: React.ReactNode; className?: string}) { return github ? <a className={className} href={github} target="_blank" rel="noreferrer">{children}</a> : <span className={`${className || ''} coming-soon`} title="The public code repository will be announced here."><Github size={16}/> Code coming soon</span>; }
const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
function ModelIcon({model}: {model: { icon?: string; color: string }}) {
  return model.icon ? <img className="model-icon" src={`${base}/icons/models/${model.icon}.svg`} width={20} height={20} alt="" aria-hidden="true"/> : <span className="model-dot" style={{background:model.color}}/>;
}
function ModelAxisTick({x = 0, y = 0, payload}: {x?: number; y?: number; payload?: {value: string}}) {
  const model = [...liteModels, ...models].find(m => m.name === payload?.value);
  if (!model) return <g/>;
  return <g transform={`translate(${x},${y})`} className="model-axis-tick">
    {model.icon && <image href={`${base}/icons/models/${model.icon}.svg`} x={-162} y={-10} width={20} height={20} aria-hidden="true"/>}
    <text x={-134} y={0} dy="0.35em" textAnchor="start" fontSize={11} fill="#343b45">{model.name}</text>
  </g>;
}
const fmt = (v:number|null) => v === null ? '—' : `${v.toFixed(2)}×`;
export default function Benchmark() {
  const [metric,setMetric] = useState('faster_rate_percent');
  const sorted = [...models].sort((a,b)=>metric==='faster_rate_percent' ? b.faster_rate_percent-a.faster_rate_percent || b.median_speedup-a.median_speedup : b.median_speedup-a.median_speedup);
  const chartMax = Math.ceil(Math.max(...models.flatMap(m=>m.tasks.map(t=>t.reward ?? 0))));
  const [query,setQuery] = useState('');
  const [group,setGroup] = useState('all');
  const [selected,setSelected] = useState<string[]>(models.map(m=>m.model));
  const [focus,setFocus] = useState<TraceFocus|null>(null);
  const visible = models.filter(m=>selected.includes(m.model));
  const indices = tasks.map((t,i)=>i).filter(i=>(group==='all'||tasks[i].startsWith(group)) && `${tasks[i]} ${taskNames[i]}`.toLowerCase().includes(query.toLowerCase()));
  return <Tooltip.Provider delayDuration={150}><a className="skip" href="#lite-set">Skip to results</a>
    <header><a className="brand" href="#"><Layers3 size={23}/> <span>RSIBench<span className="muted"> / Infra</span></span></a><nav aria-label="Main navigation"><a href="#lite-set">01 / RSIBench-Infra-Lite</a><a href="#leaderboard">02 / RSIBench-Infra</a><a href="#results">03 / Tasks</a><a href="#about">04 / Benchmarks</a></nav><CodeLink className="nav-github"><Github size={17}/><span>GitHub</span><ArrowUpRight size={14}/></CodeLink></header>
    <main><section className="hero">
      <h1>RSIBench<span>-Infra</span></h1>
      <h2>Can agents optimize their own<br className="desktop-break"/> training and inference infrastructure?</h2>
      <p className="hero-description">From kernels to the full software stack. Evaluating AI agents on<br className="desktop-break"/> real, production-scale infrastructure optimization.</p>
      <p className="authors">Hanlin Wu<sup>1,2,3,*</sup><span>Yifei Wang<sup>1,2,3,*</sup></span> Zhicheng Cai<sup>1,2,3</sup><span>Huan-ang Gao<sup>1,2,3</sup></span><br/>Wei-Ying Ma<sup>2,3</sup><span>Ya-Qin Zhang<sup>2,3</sup></span> Jingjing Liu<sup>2,3</sup><span>Mingxuan Wang<sup>1,3</sup></span> Hao Zhou<sup>2,3,†</sup></p>
      <p className="affiliations">¹ ByteDance Seed <span>² Tsinghua AIR</span> ³ SIA-Lab</p><p className="contributions">* Equal contribution · † Corresponding author</p>
      <div className="hero-actions"><a className="button primary" href="#lite-set">Explore the results <ArrowDown size={16}/></a><CodeLink className="button"><Github size={17}/> Code & benchmark <ArrowUpRight size={15}/></CodeLink></div>
      <div className="stats"><div><strong>20</strong><span>real-world tasks</span></div><div><strong>16 <small>+ 4</small></strong><span>inference + training</span></div><div><strong>{models.length}</strong><span>evaluated models</span></div><div><strong>{liteSet.rows.length}</strong><span>Lite Set tasks</span></div></div>
    </section>
    <section id="lite-set" className="section lite-section">
      <div className="section-kicker">01 / RSIBench-Infra-Lite</div>
      <div className="section-heading"><div><h2>RSIBench-Infra-Lite leaderboard.</h2><p>Mean normalized score across five workloads; ranked from highest to lowest.</p></div></div>
      <div className="lite-chart"><div className="lite-chart-legend"><span>Mean normalized Agent score</span><span className="lite-reference oracle">Oracle = 0.5</span><span className="lite-reference sol">SOL = 1</span></div><div role="img" aria-label="Lite Set model ranking by mean normalized Agent score; exact mean scores are labeled on the bars."><ResponsiveContainer width="100%" height={liteModels.length * 42 + 40}><BarChart data={liteModels} layout="vertical" margin={{left:0,right:48,top:12,bottom:0}} barSize={22}><CartesianGrid horizontal={false} stroke="#e8ecef" strokeDasharray="3 5"/><XAxis type="number" domain={liteDomain} tickFormatter={v=>v.toFixed(1)} axisLine={false} tickLine={false}/><YAxis type="category" dataKey="name" width={175} interval={0} axisLine={false} tickLine={false} tick={<ModelAxisTick/>}/><ChartTooltip formatter={v=>[Number(v).toFixed(3), "Mean normalized Agent score"]}/><ReferenceLine x={0.5} stroke="#8793a0" strokeDasharray="4 3"/><ReferenceLine x={1} stroke="#0b7285" strokeDasharray="4 3"/><Bar isAnimationActive={false} dataKey="mean_score" radius={[0,3,3,0]}><LabelList dataKey="mean_score" position="right" formatter={v=>Number(v).toFixed(3)} style={{fontSize:11,fill:"#343b45"}}/>{liteModels.map(m=><Cell key={m.model} fill={identities[m.display_name]?.color || "#0b7285"}/>)}</Bar></BarChart></ResponsiveContainer></div></div>
      <div className="lite-workload-heading"><h3>Model scores by workload</h3><p>Same scale and model order across all five charts. Higher is better.</p></div>
      <div className="lite-chart-legend"><span>Normalized Agent score · — No verified score</span><span className="lite-reference oracle">Oracle = 0.5</span><span className="lite-reference sol">SOL = 1</span></div>
      <div className="lite-workload-grid">
        {liteSet.rows.map((row, index) => {
          const chartData = liteModels.map(model => ({ ...model, score: model.tasks.find(task => task.task === row.task_id)?.score ?? null }));
          return <figure className="lite-workload-chart" key={row.task_id} aria-labelledby={`lite-workload-${index}`}>
            <figcaption id={`lite-workload-${index}`}><span>{String(index + 1).padStart(2, '0')}</span>{row.task}</figcaption>
            <div aria-hidden="true"><ResponsiveContainer width="100%" height={liteModels.length * 34 + 40}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 44, top: 10, bottom: 0 }} barSize={16}>
                <CartesianGrid horizontal={false} stroke="#e8ecef" strokeDasharray="3 5"/>
                <XAxis type="number" domain={liteTaskDomain} ticks={Array.from({length: Math.round((liteTaskDomain[1] - liteTaskDomain[0]) * 2) + 1}, (_, i) => liteTaskDomain[0] + i * 0.5)} tickFormatter={v => v.toFixed(1)} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#7b8088' }}/>
                <YAxis type="category" dataKey="name" width={175} interval={0} axisLine={false} tickLine={false} tick={<ModelAxisTick/>}/>
                <ChartTooltip cursor={{ fill: '#f5f7fa' }} formatter={v => [Number(v).toFixed(6), 'Normalized Agent score']}/>
                <ReferenceLine x={0.5} stroke="#8793a0" strokeDasharray="4 3"/>
                <ReferenceLine x={1} stroke="#0b7285" strokeDasharray="4 3"/>
                {/* An explicit shape retains zero-width bars in Recharts label data. */}
                <Bar isAnimationActive={false} dataKey="score" radius={[0, 3, 3, 0]} shape={<Rectangle/>}>
                  <LabelList dataKey="score" position="right" formatter={v => v == null ? '—' : Number(v).toFixed(3)} style={{ fontSize: 10, fill: '#343b45' }}/>
                  {chartData.map(model => <Cell key={model.model} fill={model.color || '#0b7285'}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer></div>
            <ul className="sr-only">{chartData.map(model => <li key={model.model}>{model.name}: <span className="lite-score-agent">{model.score === null ? '—' : model.score.toFixed(3)}</span></li>)}</ul>
          </figure>;
        })}
      </div>
      <p className="chart-note">Normalization follows <a href="https://research.nvidia.com/benchmarks/sol-execbench" target="_blank" rel="noreferrer">SOL-ExecBench</a>: <span className="normalization-formula" dangerouslySetInnerHTML={{ __html: normalizationHtml }}/>. Oracle = 0.5 and SOL = 1.0. Agent values are derived from each model's verified Lite Set speedup; these derived scores are not official rewards. Values above 1 are retained as an audit signal that measured runtime is faster than the analytical SOL estimate. SOL estimates use <a href="https://github.com/ai-dynamo/aisimulate" target="_blank" rel="noreferrer">AISimulate</a> evidence with the task-specific caveats described in the paper.</p>
    </section>
    <section id="leaderboard" className="section leaderboard"><div className="section-kicker">02 / RSIBench-Infra</div><div className="section-heading"><div><h2>RSIBench-Infra leaderboard.</h2><p>How often can an agent make a real workload faster?</p></div></div>
      <Tabs.Root value={metric} onValueChange={setMetric}><div className="chart-toolbar"><Tabs.List className="tabs" aria-label="Ranking metric"><Tabs.Trigger value="faster_rate_percent">Faster rate</Tabs.Trigger><Tabs.Trigger value="median_speedup">Median speedup</Tabs.Trigger></Tabs.List><span className="axis-note">Higher is better <ArrowUpRight size={14}/></span></div>
      <div className="ranking-chart" role="img" aria-label={`Model ranking by ${metric === 'faster_rate_percent' ? 'faster rate' : 'median speedup'}. Exact values are available in the model cards below.`}><ResponsiveContainer width="100%" height={350}><BarChart data={sorted} layout="vertical" margin={{left:0,right:48,top:12,bottom:0}} barSize={22}><CartesianGrid horizontal={false} stroke="#e8ecef" strokeDasharray="3 5"/><XAxis type="number" domain={metric==='faster_rate_percent'?[0,100]:[0,'auto']} tickFormatter={v=>metric==='faster_rate_percent'?`${v}%`:`${v}×`} axisLine={false} tickLine={false} tick={{fontSize:11,fill:'#7b8088'}}/><YAxis type="category" dataKey="name" width={175} axisLine={false} tickLine={false} interval={0} tick={<ModelAxisTick/>}/><ChartTooltip cursor={{fill:'#f5f7fa'}} formatter={(v)=>metric==='faster_rate_percent'?`${v}%`:`${Number(v).toFixed(3)}×`}/><Bar isAnimationActive={false} dataKey={metric} radius={[0,4,4,0]} label={{position:'right',fontSize:12,fill:'#404752',formatter:(v:unknown)=>metric==='faster_rate_percent'?`${v}%`:`${Number(v).toFixed(2)}×`}}>{sorted.map(m=><Cell key={m.model} fill={m.color}/>)}</Bar></BarChart></ResponsiveContainer></div></Tabs.Root>
      <div className="metric-footnote"><span><strong>Faster rate</strong> · Share of all 20 tasks with speedup &gt; 1.10×.</span><span><strong>Median speedup</strong> · Across all 20 tasks; missing results contribute 0.</span></div>
      <div className="model-grid">{models.map(m=><article className="model-card" key={m.model} style={{'--model-color':m.color} as React.CSSProperties}><div className="model-top"><ModelIcon model={m}/><h3>{m.name}</h3><span className="model-rank">#{m.rank}</span></div><div className="model-values"><strong>{m.faster_rate_percent.toFixed(0)}<small>%</small></strong><div>{fmt(m.median_speedup)}<span>median speedup</span></div></div><div className="mini-chart" role="img" aria-label={`${m.name}: ${m.faster_rate_percent}% faster rate, ${fmt(m.median_speedup)} median speedup. Bars show the 20 tasks with a shared 0 to ${chartMax} scale.`}><ResponsiveContainer width="100%" height={65}><BarChart data={m.tasks} margin={{top:3,right:0,left:0,bottom:0}}><YAxis hide domain={[0,chartMax]}/><ChartTooltip labelFormatter={(_,p)=>p[0]?.payload.task} formatter={v=>fmt(Number(v))}/><ReferenceLine y={1.1} stroke="#b9c0c9" strokeDasharray="2 2"/><Bar isAnimationActive={false} dataKey="reward" fill={m.color} radius={[2,2,0,0]}/></BarChart></ResponsiveContainer></div><div className="model-bottom"><span>{m.scored}/20 scored</span><span className={m.scored===20?'complete':'provisional'}>{m.scored===20?'Complete':'Provisional'}</span></div></article>)}</div>
      <p className="evaluation-note"><strong>Claude Opus 5.5:</strong> 4 of 20 tasks could not be tested because Anthropic risk-control restrictions were triggered. These tasks are DeepSeek V4 Flash (infer-deepseekv4flash-284b), GLM-5.3 Flash (infer-glm5p3flash-320b), Qwen3 OPD (train-qwen3-8b-opd), and Qwen3-VL GRPO (train-qwen3vl-4b-grpo).</p>
    </section>
    <section id="results" className="section"><div className="section-kicker">03 / RSIBench-Infra</div><div className="section-heading"><div><h2>RSIBench-Infra agent trajectory explorer.</h2><p>Click any score to explore the original Agent trajectory.</p></div></div>
      <div className="explorer-tools"><Tabs.Root value={group} onValueChange={setGroup}><Tabs.List className="tabs" aria-label="Task category"><Tabs.Trigger value="all">All tasks · 20</Tabs.Trigger><Tabs.Trigger value="infer">Inference · 16</Tabs.Trigger><Tabs.Trigger value="train">Training · 4</Tabs.Trigger></Tabs.List></Tabs.Root><label className="search"><Search size={16}/><input aria-label="Search tasks" placeholder="Find a task…" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
      <div className="model-filters"><SlidersHorizontal size={14}/>{models.map(m=><button key={m.model} aria-pressed={selected.includes(m.model)} onClick={()=>setSelected(selected.includes(m.model)?selected.filter(x=>x!==m.model):[...selected,m.model])} className={selected.includes(m.model)?'selected':''}><span style={{background:m.color}}>{selected.includes(m.model)&&<Check size={9}/>}</span>{m.name}</button>)}<button onClick={()=>{setSelected(models.map(m=>m.model));setGroup('all');setQuery('')}}>Reset</button></div>
      {visible.length&&indices.length?<div className="table-scroll"><table><caption className="sr-only">Verified speedup by task and model. Click any cell to view the original Agent trajectory. Missing results are displayed as a dash.</caption><thead><tr><th>WORKLOAD <span>↓</span></th>{visible.map(m=><th key={m.model}><ModelIcon model={m}/>{m.name}</th>)}</tr></thead><tbody>{indices.map(i=><tr key={tasks[i]}><th><span className="task-index">{String(i+1).padStart(2,'0')}</span><div>{taskNames[i]}<small>{tasks[i].startsWith('train')?'TRAINING':'INFERENCE'}</small></div></th>{visible.map(m=>{const t=m.tasks[i];const best=Math.max(...models.map(x=>x.tasks[i].reward??-1));return <td key={m.model}><Tooltip.Root><Tooltip.Trigger asChild><button className={`score ${t.reward===null?'missing':''} ${t.reward===best?'best':''}`} style={{background:t.reward===null?'#f4f5f6':`${m.color}${Math.round(15+Math.min(t.reward/4,1)*65).toString(16).padStart(2,'0')}`,borderColor:t.reward===best?m.color:'transparent'}} data-trace-selected={focus?.modelId===m.model && focus?.task===tasks[i]} onClick={()=>setFocus({model:m.name,modelId:m.model,task:tasks[i],reward:t.reward,status:t.status})} aria-label={`${m.name}, ${tasks[i]}, ${fmt(t.reward)}, ${t.status}`}>{fmt(t.reward)}</button></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="tooltip" sideOffset={5}>{m.name}<br/>{tasks[i]}<br/>{t.reward===null?'No verified score':`${t.reward.toFixed(6)}×`} · {t.status}<Tooltip.Arrow/></Tooltip.Content></Tooltip.Portal></Tooltip.Root></td>})}</tr>)}</tbody></table></div>:<div className="empty">No results match your selection. Use Reset to show all models and tasks.</div>}
      <div className="matrix-legend"><span>Color intensity indicates speedup</span><span><i className="legend-best"/> Best on task (ties included)</span><span>— No verified score</span><span>0.00× Verified zero reward</span></div>
      {focus&&<TrajectoryViewer key={`${focus.modelId}/${focus.task}`} focus={focus} onClose={()=>setFocus(null)}/>}
    </section>
    <section id="about" className="section about"><div><div className="section-kicker">04 / THE BENCHMARKS</div><h2>RSIBench-Infra-Lite<br/>&amp; RSIBench-Infra.</h2><p>RSIBench-Infra evaluates 20 production-scale training and inference workloads. RSIBench-Infra-Lite focuses on five inference workloads, with normalized scores relative to Oracle and analytical SOL references.</p><CodeLink className="text-link">Explore the benchmark <ArrowRight size={16}/></CodeLink></div><div className="method-list"><article><span>01</span><div><h3>Freedom across the stack</h3><p>Agents can modify the software stack inside a sandbox, rather than being limited to a single layer.</p></div></article><article><span>02</span><div><h3>End-to-end evaluation</h3><p>16 inference and 4 training tasks measure performance on real workloads, with task-specific verification.</p></div></article><article><span>03</span><div><h3>Reproducible submissions</h3><p>An OCI image layer submission protocol captures changes across the environment, beyond a Git patch.</p></div></article></div></section>

    </main><footer><a className="brand" href="#"><Layers3 size={19}/> RSIBench-Infra</a><span>A benchmark for the infrastructure of self-improvement.</span><CodeLink>GitHub <ArrowUpRight size={14}/></CodeLink></footer>
  </Tooltip.Provider>;
}
