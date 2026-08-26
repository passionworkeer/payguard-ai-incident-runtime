// Retry smoke test with delays for stability
import fs from 'node:fs';

const BASE = 'http://localhost:3000/api/runtime';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function command(body) {
  const res = await fetch(BASE + '/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = text; }
  return { status: res.status, payload };
}

async function step(label, body, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    const r = await command(body);
    if (r.status === 200) return r;
    console.warn(`[${label}] retry ${i}/${retries} status=${r.status} body=${JSON.stringify(r.payload).slice(0, 200)}`);
    await sleep(1500 + i * 800);
  }
  return await command(body);
}

async function main() {
  const t0 = Date.now();
  const create = await command({ action: 'create', scenarioId: 'gateway-timeout' });
  const runId = create.payload.id;
  console.log('[create] id:', runId, 'duration:', Date.now() - t0, 'ms');

  const img = fs.readFileSync('public/mock/merchant-monitor.png').toString('base64');
  const stages = ['verify', 'locate', 'contact', 'escalate', 'recover', 'evaluate'];

  let runState = null;
  for (const stage of stages) {
    const body = stage === 'verify'
      ? { action: 'execute', runId, stage, image: { mediaType: 'image/png', data: img, source: 'built_in' } }
      : { action: 'execute', runId, stage };
    const r = await step(stage, body);
    if (r.status !== 200) {
      console.error(`[${stage}] final failure: status=${r.status} body=`, JSON.stringify(r.payload, null, 2));
      process.exit(1);
    }
    const exec = r.payload.execution;
    runState = r.payload.run;
    console.log(`[${stage}] ok status=${r.status} latency=${exec.metrics.latencyMs}ms confidence=${exec.metrics.confidence}% tokens=${exec.metrics.inputTokens}/${exec.metrics.outputTokens} run.status=${runState.status}`);

    if (stage === 'contact') {
      const ap = await command({ action: 'approve', runId, actionId: `${runId}-contact-approval` });
      if (ap.status !== 200) {
        console.error(`[approve] failed: ${JSON.stringify(ap.payload)}`);
        process.exit(1);
      }
      console.log(`[approve] ok run.status=${ap.payload.status} currentStage=${ap.payload.currentStage}`);
    }
  }

  const totalSec = Math.round((Date.now() - t0) / 1000);
  console.log('--- summary ---');
  console.log('total wall time:', totalSec, 's');
  console.log('run.status:', runState.status, 'completed:', runState.completedStages.length);
  const totalIn = Object.values(runState.executions).reduce((s,e)=>s+e.metrics.inputTokens,0);
  const totalOut = Object.values(runState.executions).reduce((s,e)=>s+e.metrics.outputTokens,0);
  console.log('tokens in/out:', totalIn, '/', totalOut);
  const sample = runState.executions.evaluate?.output?.sampleId;
  console.log('sample:', sample);
}

main().catch(err => { console.error(err); process.exit(1); });
