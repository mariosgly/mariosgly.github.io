import { useEffect, useMemo, useState } from 'react';
import './AudioInversion.css';

type Metrics = { latent_mean_timestep_cosine?: number; latent_mean_timestep_l2?: number; mrstft_l1?: number };
type Output = { name:string; encoder:string; runId:string; audioUrl:string; qualityBand:'high'|'middle'|'low'; qualityScore:number; metrics:Metrics };
type Example = { id:string; genre:string; trackId:string; title:string; artist:string; trackUrl?:string; startSec:number; referenceUrl:string; outputs:Output[] };
type Result = { run_id:string; encoder:string; genre?:string; num_examples:number; latent_mean_timestep_cosine_mean?:number; latent_mean_timestep_normalized_cosine_mean?:number; latent_mean_timestep_normalized_cosine_std?:number; mrstft_l1_mean?:number; mrstft_l1_std?:number };
type ResultData = { overall:Result[]; by_genre:Result[]; summary?:{center:string;spread:string;display:string;population:string} };
type PlotMetricKey = 'latent_mean_timestep_normalized_cosine' | 'mrstft_l1';
type PlotDistribution = { n:number; histogram:{ min:number; max:number; counts:number[] }; box:{ min:number; q1:number; median:number; q3:number; max:number; lower_whisker:number; upper_whisker:number; mean:number; std:number } };
type PlotGroup = { run_id:string; encoder:string; encoder_label:string; variant:string; scope:'overall'|'genre'; genre:string|null; num_examples:number; distributions:Record<string,PlotDistribution> };
type PlotData = { metrics:Record<string,{label:string; direction:'higher'|'lower'}>; groups:PlotGroup[] };
type DemoData = { generatedAt:string|null; examples:Example[]; msdResults:ResultData; plotData:PlotData; method:{tracksPerGenre:number;segmentsPerTrack:number;segmentSeconds:number;genres:number} };
type VariantInfo = { name:string; scheduler:string; color:string; scheduleColor:string; smallInit:boolean; attentionBias:boolean };
type ScheduleDef = { id:string; label:string; color:string; lr:(step:number)=>number };
type BandLookup = Record<string,Record<string,Output['qualityBand']>>;
type SeriesItem = { group:PlotGroup; dist:PlotDistribution };

const emptyPlot:PlotData = {metrics:{},groups:[]};
const empty: DemoData = {generatedAt:null,examples:[],msdResults:{overall:[],by_genre:[]},plotData:emptyPlot,method:{tracksPerGenre:8,segmentsPerTrack:2,segmentSeconds:5,genres:15}};
const encoderOrder = ['VGGish','CLAP 5s','CLAP 1s','ConvNeXt pooled','ConvNeXt flattened','EnCodec zq'];
const genreOrder = ['Blues','Country','Electronic','Folk','Jazz','Latin','Metal','New Age','Pop','Punk','Rap','Reggae','RnB','Rock','World'];
const resultEncoders = [
  {id:'vggish_5sec',name:'VGGish'},
  {id:'clap_5sec_5sec_embedding',name:'CLAP 5s'},
  {id:'clap_5sec_1sec_embedding',name:'CLAP 1s'},
  {id:'convnext_5sec_pooled',name:'ConvNeXt pooled'},
  {id:'convnext_5sec_flattened',name:'ConvNeXt flattened'},
  {id:'encodec_5sec',name:'EnCodec zq'},
];
const validationBestRuns = new Set([
  'paper_vggish_default_lr','paper_clap_5s_default_lr','paper_clap_1s_default_lr',
  'paper_convnext_pooled_default_lr','paper_convnext_flattened_default_lr',
  'paper_encodec_purple_slow_decay_step36k',
]);
const encodecBaselineRun = 'paper_encodec_decoder_upper_bound';
const maxStep = 40000;
const baseHighLr = 0.000246297104831;
const schedules:ScheduleDef[] = [
  {id:'default',label:'Low-LR inverse',color:'#e5b83e',lr:step=>0.00005*(1-0.99**(step+1))*(1+step/1000000)**-0.5},
  {id:'plateau',label:'High-LR plateau',color:'#8f70db',lr:step=>baseHighLr*warmupMult(step,0.995,3000)},
  {id:'slow',label:'Slow decay floor',color:'#dd4b82',lr:step=>piecewiseWarmup(step,0.995,1000,1000,baseHighLr,[{step:5000,lr:baseHighLr,kind:'linear'},{step:24000,lr:0.0001,kind:'cosine'},{step:1000000000,lr:0.0001,kind:'linear'}])},
];

const encoderColors: Record<string,string> = {
  vggish_5sec: '#2a78d6',
  clap_5sec_5sec_embedding: '#eda100',
  clap_5sec_1sec_embedding: '#eb6834',
  convnext_5sec_pooled: '#1baf7a',
  convnext_5sec_flattened: '#008300',
  encodec_5sec: '#e34948',
};
function encoderHex(encoderId:string){ return encoderColors[encoderId] || '#6b7280'; }

function warmupMult(step:number,warmup:number,warmupSteps:number){
  if(warmup===0 || step>=warmupSteps) return 1;
  const warmed = 1 - warmup ** (step + 1);
  const target = 1 - warmup ** (warmupSteps + 1);
  return Math.min(1,warmed/target);
}
function interpolate(position:number,kind:string){
  return kind==='cosine' ? 0.5*(1-Math.cos(Math.PI*position)) : position;
}
function piecewiseWarmup(step:number,warmup:number,warmupSteps:number,warmupUntilStep:number,baseLr:number,milestones:{step:number;lr:number;kind:string}[]){
  if(step<=warmupUntilStep) return baseLr*warmupMult(step,warmup,warmupSteps);
  let prevStep = warmupUntilStep;
  let prevLr = baseLr*warmupMult(warmupUntilStep,warmup,warmupSteps);
  for(const milestone of milestones){
    if(step<=milestone.step){
      const position = interpolate((step-prevStep)/(milestone.step-prevStep),milestone.kind);
      return prevLr + (milestone.lr-prevLr)*position;
    }
    prevStep = milestone.step;
    prevLr = milestone.lr;
  }
  return milestones[milestones.length-1].lr;
}

function variantFor(runId:string):VariantInfo {
  if(runId.endsWith('_plain')) return {name:'Plain conditioning',scheduler:'Low-LR inverse',color:'plain',scheduleColor:'default',smallInit:false,attentionBias:false};
  if(runId.endsWith('_smallinit')) return {name:'Small initialization',scheduler:'Low-LR inverse',color:'small',scheduleColor:'default',smallInit:true,attentionBias:false};
  if(runId.includes('purple_plateau')) return {name:'High-LR plateau',scheduler:'3k warmup, hold',color:'plateau',scheduleColor:'plateau',smallInit:true,attentionBias:true};
  if(runId.includes('purple_slow_decay_step36k')) return {name:'Slow decay floor · 36k',scheduler:'1k warmup, decay to 1e-4',color:'slow',scheduleColor:'slow',smallInit:true,attentionBias:true};
  if(runId.includes('purple_slow_decay')) return {name:'Slow decay floor',scheduler:'1k warmup, decay to 1e-4',color:'slow',scheduleColor:'slow',smallInit:true,attentionBias:true};
  return {name:'Small init + attention bias',scheduler:'Low-LR inverse',color:'default',scheduleColor:'default',smallInit:true,attentionBias:true};
}
function encoderName(id:string){return resultEncoders.find(item=>item.id===id)?.name||id;}

function fmt(value?:number) { return value == null ? '—' : value.toFixed(4); }
function fmtMeanStd(mean?:number,std?:number) { return mean == null ? '—' : std == null ? mean.toFixed(4) : `${mean.toFixed(4)} ± ${std.toFixed(4)}`; }
function resultCosine(row:Result) { return row.latent_mean_timestep_normalized_cosine_mean ?? row.latent_mean_timestep_cosine_mean; }
function deriveTestBestRuns(rows:Result[]) {
  const winners = new Map<string, Result>();
  for(const row of rows){
    if(row.run_id===encodecBaselineRun) continue;
    const cosine = resultCosine(row);
    if(cosine == null || !Number.isFinite(cosine)) continue;
    const current = winners.get(row.encoder);
    if(!current || cosine > (resultCosine(current) ?? -Infinity)) winners.set(row.encoder,row);
  }
  return new Set([...winners.values()].map(row=>row.run_id));
}
function fmtLr(value:number) { return value >= 0.0001 ? value.toFixed(5) : value.toExponential(0); }
function fmtPlot(value:number) { return Math.abs(value) >= 1 ? value.toFixed(2) : value.toFixed(3); }
function variantRank(runId:string) {
  const color = variantFor(runId).color;
  return ['plain','small','default','plateau','slow','hold'].indexOf(color);
}
function cosineBandLookup(examples:Example[]):BandLookup{
  const lookup:BandLookup = {};
  for(const name of encoderOrder){
    const outputs = examples
      .map(example=>({id:example.id,output:example.outputs.find(item=>item.name===name)}))
      .filter((item):item is {id:string;output:Output}=>Number.isFinite(item.output?.metrics.latent_mean_timestep_cosine));
    const sorted = [...outputs].sort((a,b)=>(a.output.metrics.latent_mean_timestep_cosine ?? 0)-(b.output.metrics.latent_mean_timestep_cosine ?? 0));
    const denominator = Math.max(1,sorted.length-1);
    lookup[name] = {};
    sorted.forEach((item,rank)=>{
      const percentile = rank/denominator;
      lookup[name][item.id] = percentile>=2/3 ? 'high' : percentile<1/3 ? 'low' : 'middle';
    });
  }
  return lookup;
}

function ScheduleChart(){
  const width = 660, height = 176, left = 58, right = 14, top = 12, bottom = 34;
  const plotW = width-left-right, plotH = height-top-bottom;
  const maxLr = Math.max(...schedules.flatMap(schedule=>[0,1000,3000,5000,10000,24000,maxStep].map(step=>schedule.lr(step))));
  const yTicks = [0,maxLr,0.0002,0.00015,0.0001,0.00005].sort((a,b)=>a-b);
  const x = (step:number)=>left+(step/maxStep)*plotW;
  const y = (lr:number)=>top+plotH-(lr/maxLr)*plotH;
  const pathFor = (schedule:ScheduleDef)=>Array.from({length:161},(_,i)=>{
    const step = Math.round((i/160)*maxStep);
    return `${i?'L':'M'}${x(step).toFixed(1)} ${y(schedule.lr(step)).toFixed(1)}`;
  }).join(' ');
  return <div className="schedule-card">
    <div className="schedule-copy"><strong>Learning-rate schedules</strong><span>Computed from the training scheduler configs, shown through 40k optimizer steps.</span></div>
    <svg className="schedule-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Learning-rate schedules through 40k training steps">
      {yTicks.map(tick=><g key={tick}><line x1={left} x2={width-right} y1={y(tick)} y2={y(tick)} /><text x={left-9} y={y(tick)+4}>{tick===0?'0':fmtLr(tick)}</text></g>)}
      {[0,10000,20000,30000,40000].map(tick=><text className="x-tick" key={tick} x={x(tick)} y={height-10}>{tick/1000}k</text>)}
      {schedules.map(schedule=><path key={schedule.id} d={pathFor(schedule)} stroke={schedule.color} />)}
      <text className="peak-label" x={width-right} y={top+11}>peak {fmtLr(maxLr)}</text>
    </svg>
    <div className="schedule-legend">{schedules.map(schedule=><span key={schedule.id}><b style={{background:schedule.color}} />{schedule.label}</span>)}</div>
  </div>;
}

// ---------- Violin plot machinery ----------

function catmullRomPath(points:{x:number;y:number}[]) {
  if(points.length === 0) return '';
  if(points.length === 1) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  if(points.length === 2) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} L ${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`;
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} `;
  for(let i=0;i<points.length-1;i++){
    const p0 = points[i-1] || points[i];
    const p1 = points[i];
    const p2 = points[i+1];
    const p3 = points[i+2] || p2;
    const cp1x = p1.x + (p2.x - p0.x)/6;
    const cp1y = p1.y + (p2.y - p0.y)/6;
    const cp2x = p2.x - (p3.x - p1.x)/6;
    const cp2y = p2.y - (p3.y - p1.y)/6;
    d += `C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} `;
  }
  return d;
}

function buildViolinNodes(dist:PlotDistribution, maxHalf:number, capAtZero:boolean) {
  const counts = dist.histogram.counts;
  const maxCount = Math.max(...counts, 1);
  const span = Math.max(dist.histogram.max - dist.histogram.min, 1e-6);
  const bins = counts.map((count,i)=>{
    let val = dist.histogram.min + ((i+0.5)/counts.length)*span;
    if (capAtZero) val = Math.max(0, val);
    return {
      value: val,
      half: (count/maxCount)*maxHalf,
    };
  });
  let minVal = dist.histogram.min;
  let maxVal = dist.histogram.max;
  if (capAtZero) {
    minVal = Math.max(0, minVal);
    maxVal = Math.max(0, maxVal);
  }
  return [{value:minVal, half:0}, ...bins, {value:maxVal, half:0}];
}

function violinOutline(
  nodes:{value:number;half:number}[],
  posFor:(v:number)=>number,
  crossFor:(offset:number)=>number,
  mainAxis:'x'|'y',
) {
  const toPoint = (n:{value:number;half:number}, sign:1|-1) => {
    const main = posFor(n.value);
    const cross = crossFor(sign*n.half);
    return mainAxis==='y' ? {x:cross,y:main} : {x:main,y:cross};
  };
  const rightSide = nodes.map(n=>toPoint(n,1));
  const leftSide = [...nodes].reverse().map(n=>toPoint(n,-1));
  const full = [...rightSide, ...leftSide.slice(1)];
  return catmullRomPath(full) + ' Z';
}

function SelectionBadges({runId,testBestRuns,showValidation}:{runId:string; testBestRuns:Set<string>; showValidation:boolean}) {
  const isTestBest = testBestRuns.has(runId);
  const isValidationBest = validationBestRuns.has(runId);
  if(!isTestBest && (!showValidation || !isValidationBest)) return null;
  return <span className="selection-labels">
    {isTestBest && <span className="best-label test-best">Test best</span>}
    {showValidation && isValidationBest && <span className="best-label validation-best">Validation best</span>}
  </span>;
}

function ViolinLegend() {
  return <div className="violin-legend">
    <span><i className="swatch-mean" /> mean</span>
    <span><i className="swatch-median" /> median</span>
    <span><i className="swatch-box" /> IQR (25th–75th pct.)</span>
    <span className="violin-legend-hint">Hover a violin to show detailed values on the axis</span>
  </div>;
}

function HorizontalViolins({series,min,max,capAtZero,hoverKey,setHoverKey,testBestRuns,showValidationBest}:{
  series:SeriesItem[]; min:number; max:number; capAtZero:boolean; hoverKey:string|null; setHoverKey:(k:string|null)=>void; testBestRuns:Set<string>; showValidationBest:boolean;
}) {
  const rowH = 54, left = 310, right = 40, top = 34, bottom = 80;
  const width = 960;
  const height = top+bottom+series.length*rowH;
  const plotW = width-left-right;
  const x = (value:number)=>left+((value-min)/(max-min))*plotW;
  const ticks = [min, min+(max-min)*0.25, min+(max-min)*0.5, min+(max-min)*0.75, max];
  const keyFor = (item:SeriesItem)=>`${item.group.run_id}-${item.group.genre||'overall'}`;

  const bx = (v: number) => x(capAtZero ? Math.max(0, v) : v);

  return <div className="violin-scroll">
    <svg className="violin-chart violin-horizontal" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Metric distributions as violin plots with mean, median and IQR">
      {/* Background Grid Lines & Ticks */}
      {ticks.map(tick=><g key={tick}>
        <line x1={x(tick)} x2={x(tick)} y1={top-10} y2={height-bottom+2} />
        <text className="x-tick" x={x(tick)} y={top-16} textAnchor="middle">{fmtPlot(tick)}</text>
      </g>)}
      {/* Bottom X-axis baseline */}
      <line x1={left} x2={width-right} y1={height-bottom+2} y2={height-bottom+2} stroke="#e9ecf1" strokeWidth={1.5} />
      {min<=0 && max>=0 && <line className="zero-axis" x1={x(0)} x2={x(0)} y1={top-10} y2={height-bottom+2} />}

      {/* Violin distributions */}
      {series.map((item,i)=>{
        const cy = top+i*rowH+rowH/2;
        const color = encoderHex(item.group.encoder);
        const box = item.dist.box;
        const k = keyFor(item);
        const variant = variantFor(item.group.run_id);
        const nodes = buildViolinNodes(item.dist, rowH/2-8, capAtZero);
        const path = violinOutline(nodes, x, (offset)=>cy+offset, 'x');
        
        return <g key={k} className={`violin-group${hoverKey===k?' active':''}`}
          onMouseEnter={()=>setHoverKey(k)}
          onMouseLeave={()=>setHoverKey(null)}>
          <rect className="hit-area" x={0} y={cy-rowH/2} width={width} height={rowH} />
          
          <foreignObject x={0} y={cy-rowH/2} width={left-14} height={rowH} style={{ pointerEvents: 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', height: '100%', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <SelectionBadges runId={item.group.run_id} testBestRuns={testBestRuns} showValidation={showValidationBest} />
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', lineHeight: 1 }}>
                  {encoderName(item.group.encoder)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end', width: '100%' }}>
                <span className={`scheduler ${variant.scheduleColor}`} style={{ padding: '4px 6px', fontSize: '9px', marginRight: 'auto' }}>{variant.scheduler}</span>
                <div className="setup-badges">
                  <span className={variant.smallInit ? 'on' : ''}>Small init</span>
                  <span className={variant.attentionBias ? 'on' : ''}>Attention bias</span>
                </div>
              </div>
            </div>
          </foreignObject>

          <path className="violin-shape" d={path} fill={color} />
          <line className="whisker" x1={bx(box.lower_whisker)} x2={bx(box.upper_whisker)} y1={cy} y2={cy} />
          <line className="whisker-cap" x1={bx(box.lower_whisker)} x2={bx(box.lower_whisker)} y1={cy-11} y2={cy+11} />
          <line className="whisker-cap" x1={bx(box.upper_whisker)} x2={bx(box.upper_whisker)} y1={cy-11} y2={cy+11} />
          <rect className="box" x={bx(box.q1)} y={cy-13} width={Math.max(2, bx(box.q3)-bx(box.q1))} height={26} fill={color} />
          <line className="median" x1={bx(box.median)} x2={bx(box.median)} y1={cy-15} y2={cy+15} />
          <circle className="mean-dot" cx={bx(box.mean)} cy={cy} r={4} fill="white" stroke={color} />
        </g>;
      })}

      {/* Hover Overlays */}
      {series.map((item,i)=>{
        const k = keyFor(item);
        if(hoverKey!==k) return null;
        
        const box = item.dist.box;
        const yTop = top - 10;
        const yBottom = height - bottom + 2;

        const lines = [
          { key: 'q1', val: box.q1, label: 'Q1' },
          { key: 'med', val: box.median, label: 'Med' },
          { key: 'mean', val: box.mean, label: 'Mean' },
          { key: 'q3', val: box.q3, label: 'Q3' },
        ];

        // Greedy collision-avoidance layout for the text labels
        const sortedLines = [...lines].sort((a, b) => a.val - b.val);
        const lastX = [-999, -999, -999, -999];
        const arrangedLines = sortedLines.map(ln => {
          const clamped = capAtZero ? Math.max(0, ln.val) : ln.val;
          const px = x(clamped);
          let assignedRow = 0;
          for(let r=0; r<4; r++) {
            if (px - lastX[r] > 66) { // Ensure at least 66px gap between labels on the same row
              assignedRow = r;
              lastX[r] = px;
              break;
            }
          }
          return { ...ln, px, clamped, row: assignedRow };
        });

        return <g key={`hover-lines-${k}`} pointerEvents="none">
          {arrangedLines.map(ln => {
            const yOffset = ln.row * 16;
            return <g key={ln.key}>
              <line x1={ln.px} x2={ln.px} y1={yTop} y2={yBottom} style={{ stroke: '#000000' }} strokeWidth={1.5} strokeDasharray="4 4" />
              <rect x={ln.px-32} y={yBottom + 4 + yOffset} width={64} height={15} fill="white" opacity={0.9} />
              <text x={ln.px} y={yBottom + 15 + yOffset} fill="#000000" fontSize="10" fontWeight="700" textAnchor="middle">
                {ln.label} {fmtPlot(ln.clamped)}
              </text>
            </g>;
          })}
        </g>;
      })}
    </svg>
  </div>;
}

function ViolinBoxPlot({groups, metric, msdResults, testBestRuns, showValidationBest}:{groups:PlotGroup[]; metric:PlotMetricKey; msdResults:ResultData; testBestRuns:Set<string>; showValidationBest:boolean}) {
  const [hoverKey,setHoverKey] = useState<string|null>(null);
  const series = useMemo(()=>groups
    .map(group=>{
      const dist = group.distributions[metric];
      if (!dist) return null;
      
      const isOverall = group.scope === 'overall';
      const msdList = isOverall ? msdResults.overall : msdResults.by_genre;
      const msdRow = msdList.find(r => r.run_id === group.run_id && (isOverall || (r.genre === 'New' ? 'New Age' : r.genre) === group.genre));
      
      // Override plot mean with the accurate scoreboard mean
      let trueMean = dist.box.mean;
      if (msdRow) {
         if (metric === 'latent_mean_timestep_normalized_cosine') {
           const c = resultCosine(msdRow);
           if (c != null) trueMean = c;
         } else if (metric === 'mrstft_l1') {
           if (msdRow.mrstft_l1_mean != null) trueMean = msdRow.mrstft_l1_mean;
         }
      }
      return { group, dist: { ...dist, box: { ...dist.box, mean: trueMean } } };
    })
    .filter((item): item is SeriesItem => Boolean(item)), [groups, metric, msdResults]);
  
  if(!series.length) return <div className="plot-empty">Awaiting distribution data for this selection.</div>;

  const capAtZero = metric === 'latent_mean_timestep_normalized_cosine';

  let rawMin = Math.min(...series.map(item=>item.dist.histogram.min));
  if (capAtZero) rawMin = Math.max(0, rawMin);

  const rawMax = Math.max(...series.map(item=>item.dist.histogram.max));
  const pad = Math.max((rawMax-rawMin)*0.08, 0.0005);
  
  const min = capAtZero ? Math.max(0, rawMin - pad) : rawMin - pad;
  const max = rawMax + pad;

  return <HorizontalViolins series={series} min={min} max={max} capAtZero={capAtZero} hoverKey={hoverKey} setHoverKey={setHoverKey} testBestRuns={testBestRuns} showValidationBest={showValidationBest} />;
}

export default function AudioInversion() {
  const [data,setData] = useState<DemoData>(empty);
  
  // Unified controls
  const [activeGenre,setActiveGenre] = useState('Overall');
  const [activeEncoder,setActiveEncoder] = useState<string|null>(null);
  const [activeMetric,setActiveMetric] = useState<PlotMetricKey>('latent_mean_timestep_normalized_cosine');
  const [viewMode,setViewMode] = useState<'plot'|'table'>('plot');

  // Demo controls
  const [genre,setGenre] = useState('All genres');
  const [band,setBand] = useState('all');
  const [rankingEncoder,setRankingEncoder] = useState('VGGish');
  const [index,setIndex] = useState(0);

  useEffect(()=>{ Promise.all([
    fetch('/research/audio-embedding-inversion/data/demo.json').then(r=>r.ok?r.json():empty).catch(()=>empty),
    fetch('/research/audio-embedding-inversion/data/msd_5sec_reconstruction_scores_site.json').then(r=>r.ok?r.json():null).catch(()=>null),
    fetch('/research/audio-embedding-inversion/data/msd_5sec_reconstruction_plot_data.json').then(r=>r.ok?r.json():emptyPlot).catch(()=>emptyPlot),
  ]).then(([demo,msd,plot])=>setData({...demo,msdResults:msd||demo.msdResults||empty.msdResults,plotData:plot||emptyPlot})); },[]);
  
  const availableEncoders = useMemo(()=>encoderOrder.filter(name=>data.examples.some(example=>example.outputs.some(output=>output.name===name))),[data]);
  const activeRankingEncoder = availableEncoders.includes(rankingEncoder) ? rankingEncoder : (availableEncoders[0] || rankingEncoder);
  const cosineBands = useMemo(()=>cosineBandLookup(data.examples),[data.examples]);
  const testBestRuns = useMemo(()=>deriveTestBestRuns(data.msdResults.overall),[data.msdResults.overall]);
  
  const filtered = useMemo(()=>data.examples.filter(example=>{
    if(genre!=='All genres' && example.genre!==genre) return false;
    if(band==='all') return true;
    return example.outputs.some(output=>output.name===activeRankingEncoder && (cosineBands[activeRankingEncoder]?.[example.id] ?? output.qualityBand)===band);
  }),[data,genre,band,activeRankingEncoder,cosineBands]);
  
  const safeIndex = filtered.length ? index % filtered.length : 0;
  const current = filtered[safeIndex];
  
  const resultRows = useMemo(()=>{
    const rows = (activeGenre==='Overall' ? data.msdResults.overall : data.msdResults.by_genre.filter(row=>(row.genre==='New'?'New Age':row.genre)===activeGenre))
      .filter(row=>row.run_id!==encodecBaselineRun);
    const filtered = activeEncoder ? rows.filter(row=>row.encoder===activeEncoder) : rows.filter(row=>testBestRuns.has(row.run_id));
    return [...filtered].sort((a,b)=>{
      const cosineDelta=(resultCosine(b) ?? -Infinity)-(resultCosine(a) ?? -Infinity);
      return cosineDelta || encoderName(a.encoder).localeCompare(encoderName(b.encoder)) || a.run_id.localeCompare(b.run_id);
    });
  },[data,activeGenre,activeEncoder,testBestRuns]);

  const toggleEncoder=(id:string)=>setActiveEncoder(current=>current===id?null:id);
  
  const plotRows = useMemo(()=>{
    const rows = data.plotData.groups
      .filter(row=>activeGenre==='Overall' ? row.scope==='overall' : row.scope==='genre' && (row.genre==='New'?'New Age':row.genre)===activeGenre)
      .filter(row=>row.run_id!==encodecBaselineRun);
    const filtered = activeEncoder ? rows.filter(row=>row.encoder===activeEncoder) : rows.filter(row=>testBestRuns.has(row.run_id));
    return [...filtered].sort((a,b)=>{
      if(!activeEncoder){
        const ad = a.distributions[activeMetric]?.box.mean ?? (data.plotData.metrics[activeMetric]?.direction==='higher' ? -Infinity : Infinity);
        const bd = b.distributions[activeMetric]?.box.mean ?? (data.plotData.metrics[activeMetric]?.direction==='higher' ? -Infinity : Infinity);
        return data.plotData.metrics[activeMetric]?.direction==='lower' ? ad-bd : bd-ad;
      }
      const encoderDelta = resultEncoders.findIndex(item=>item.id===a.encoder)-resultEncoders.findIndex(item=>item.id===b.encoder);
      return encoderDelta || variantRank(a.run_id)-variantRank(b.run_id) || a.run_id.localeCompare(b.run_id);
    });
  },[data,activeGenre,activeMetric,activeEncoder,testBestRuns]);

  const updateGenre=(value:string)=>{setGenre(value);setIndex(0);};
  const updateBand=(value:string)=>{setBand(value);setIndex(0);};
  const updateRankingEncoder=(value:string)=>{setRankingEncoder(value);setIndex(0);};

  return <main className="audio-inversion-demo">
    <section className="publication-hero" id="top">
      <h1 className="post-title">How Much Audio Is Left In An Embedding?</h1>
      <h1 className="post-title">An Inversion Audit Of Audio Encoders</h1>
      <p className="publication-subtitle">Registration-free listening benchmark for what frozen audio encoders preserve</p>
      <div className="publication-authors"><a href="https://mariosgly.github.io/" target="_blank" rel="noreferrer">Marios Glytsos</a><sup>1</sup>
      ,{" "}
        <a href="https://brianmcfee.net/" target="_blank" rel="noreferrer">Brian McFee</a><sup>2</sup>
      </div>
      <div className="publication-affiliations"><div className="affil-line"><sup>1</sup> Music And Audio Research Laboratory, New York University, USA</div></div>
      <div className="publication-icons"><a className="btn" href="#results">Scores</a><a className="btn" href="#demo">Demo</a><a className="btn" href="#abstract">Abstract</a></div>
      <p className="tldr"><strong>tl;dr:</strong> We ask how much of the original audio survives in a frozen embedding by adapting a pretrained diffusion architecture to reconstruct 5-sec clips from different encoders</p>
    </section>

    <section className="teaser">
      <img src="/research/audio-embedding-inversion/overview_figure.svg" alt="Audio embedding inversion overview figure" />
    </section>

    <section className="abstract" id="abstract">
      <h2>Abstract</h2>
      <p>Will copy paste the Abstract from the paper.</p>
    </section>

    <section className="results" id="results">
      <div className="results-intro">
        <p className="section-number">Results</p>
        <h2>Which embedding reconstructs best?</h2>
        <p>Start with the checkpoint selected by test-set latent cosine. Pick an encoder family to compare it against the validation-loss selection.</p>
      </div>
      <div className="result-panel">
        <div className="result-toolbar">
          <label>MSD slice
            <select value={activeGenre} onChange={e=>setActiveGenre(e.target.value)}>
              <option>Overall</option>
              {genreOrder.map(item=><option key={item}>{item}</option>)}
            </select>
          </label>
          
          {viewMode === 'plot' && (
            <label>Metric
              <select value={activeMetric} onChange={e=>setActiveMetric(e.target.value as PlotMetricKey)}>
                <option value="latent_mean_timestep_normalized_cosine">Latent cosine ↑</option>
                <option value="mrstft_l1">MR-STFT ↓</option>
              </select>
            </label>
          )}

          <label>View Mode
            <select value={viewMode} onChange={e=>setViewMode(e.target.value as 'plot'|'table')}>
              <option value="plot">Violin Plot</option>
              <option value="table">Scoreboard</option>
            </select>
          </label>
          
          <div className="comparison-mode" style={{ marginLeft: 'auto' }}>
            <span>Comparison</span>
            <button className={!activeEncoder?'active':''} onClick={()=>setActiveEncoder(null)}>Best checkpoints</button>
          </div>
        </div>

        <div className="encoder-toggles">
          <span>Reveal ablations for</span>
          {resultEncoders.map(item=><button key={item.id} aria-pressed={activeEncoder===item.id} onClick={()=>toggleEncoder(item.id)}>{item.name}<em>{activeEncoder===item.id?'×':'+'}</em></button>)}
        </div>
        
        <p className="table-caption">
          {activeEncoder?`${encoderName(activeEncoder)} selected · all variants shown · test-cosine and validation-loss picks marked`:'Best checkpoint per encoder, selected by overall test-set latent cosine'} 
          {viewMode === 'plot' ? ' · axis starts at 0' : ' · sorted by latent cosine · values are mean ± sample SD'}
        </p>

        {viewMode === 'plot' ? (
          <>
            <ViolinLegend />
            <ViolinBoxPlot groups={plotRows} metric={activeMetric} msdResults={data.msdResults} testBestRuns={testBestRuns} showValidationBest={Boolean(activeEncoder)} />
          </>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Encoder</th>
                  <th>Conditioning changes</th>
                  <th>Schedule</th>
                  <th>Latent cosine ↑</th>
                  <th>MR-STFT ↓</th>
                </tr>
              </thead>
              <tbody>
                {resultRows.map(row=>{
                  const variant=variantFor(row.run_id);
                  return <tr key={`${row.run_id}-${row.genre||'all'}`}>
                    <td><strong>{encoderName(row.encoder)}</strong><SelectionBadges runId={row.run_id} testBestRuns={testBestRuns} showValidation={Boolean(activeEncoder)} /></td>
                    <td><div className="setup-badges"><span className={variant.smallInit?'on':''}>Small init</span><span className={variant.attentionBias?'on':''}>Attention bias</span></div></td>
                    <td><span className={`scheduler ${variant.scheduleColor}`}>{variant.scheduler}</span></td>
                    <td><span className="metric-value">{fmtMeanStd(resultCosine(row),row.latent_mean_timestep_normalized_cosine_std)}</span></td>
                    <td><span className="metric-value">{fmtMeanStd(row.mrstft_l1_mean,row.mrstft_l1_std)}</span></td>
                  </tr>
                })}
                {!resultRows.length&&<tr><td colSpan={5}>Awaiting the complete MSD aggregate report.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        <div className="result-explainer" style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--line)' }}>
          <div className="ablation-notes">
            <p><span className="setup-badges"><span className="on">Small init</span></span> initializes the conditioning projection near zero, so the pretrained generator starts close to its unconditional behavior.</p>
            <p><span className="setup-badges"><span className="on">Attention bias</span></span> adds learned relative-position bias to local cross-attention between audio latents and embedding tokens.</p>
          </div>
          <ScheduleChart />
        </div>

      </div>
    </section>

    <section className="listening" id="demo">
      <div className="section-heading"><div><p className="section-number">Listening Demo</p><h2>Reference in, reconstructions out.</h2></div><p>Pick a genre, then play the source clip beside each encoder’s reconstruction. Quality bands are ranked by latent cosine.</p></div>
      <div className="controls">
        <label>Genre<select value={genre} onChange={e=>updateGenre(e.target.value)}><option>All genres</option>{genreOrder.map(item=><option key={item}>{item}</option>)}</select></label>
        <label>Cosine rank using<select value={activeRankingEncoder} onChange={e=>updateRankingEncoder(e.target.value)}>{(availableEncoders.length?availableEncoders:encoderOrder).map(item=><option key={item}>{item}</option>)}</select></label>
        <label>Cosine band<select value={band} onChange={e=>updateBand(e.target.value)}><option value="all">All bands</option><option value="high">Best third</option><option value="middle">Middle third</option><option value="low">Lower third</option></select></label>
      </div>
      {current ? <article className="example-card">
        <div className="source-copy"><span>{current.genre.toUpperCase()} · {current.trackId}</span><div><p className="source-label">Reference</p><h3>{current.title}</h3><p>{current.artist} · starts at {current.startSec.toFixed(1)}s</p></div><audio controls preload="none" src={current.referenceUrl}/>{current.trackUrl&&<a className="credit" href={current.trackUrl} target="_blank" rel="noreferrer">Track details ↗</a>}</div>
        <div className="encoder-grid">{encoderOrder.map((name,position)=>{const output=current.outputs.find(item=>item.name===name);const cosineBand=output?(cosineBands[name]?.[current.id] ?? output.qualityBand):undefined;return <div className="encoder" key={name}><span>{String(position+1).padStart(2,'0')}</span><div className="encoder-title"><strong>{name}</strong>{cosineBand&&<em className={`band ${cosineBand}`}>{cosineBand}</em>}</div>{output?<><audio controls preload="none" src={output.audioUrl}/><div className="mini-metrics"><span>cos {fmt(output.metrics.latent_mean_timestep_cosine)}</span><span>MR-STFT {fmt(output.metrics.mrstft_l1)}</span></div></>:<p className="pending">Awaiting export</p>}</div>})}</div>
      </article>:<div className="empty-state"><strong>{data.generatedAt?'No clips match these filters.':'Experiment outputs have not been exported yet.'}</strong><p>Run the bundle exporter to populate audio and metrics.</p></div>}
      <div className="pager"><button disabled={!filtered.length} onClick={()=>setIndex((safeIndex-1+filtered.length)%filtered.length)}>← Previous</button><span>{filtered.length?`${safeIndex+1} / ${filtered.length}`:'0 / 0'}</span><button disabled={!filtered.length} onClick={()=>setIndex((safeIndex+1)%filtered.length)}>Next →</button></div>
    </section>
    <footer><strong>Music And Audio Research Laboratory, NYU</strong><p></p><a href="#top">Back to top ↑</a></footer>
  </main>;
}