import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export class Store {
  constructor(dir, now = Date.now) {
    this.now = now;
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.file = join(resolve(dir), 'state.json');
    this.state = existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : { jobs: [], messages: [], requests: {}, heartbeat: null };
    // A restart does not imply the PC is still connected.
    this.state.heartbeat = null;
  }
  save() {
    writeFileSync(this.file + '.tmp', JSON.stringify(this.state), { mode: 0o600 });
    renameSync(this.file + '.tmp', this.file);
  }
  online() { return this.state.heartbeat !== null && this.now() - this.state.heartbeat < 15000; }
  status() { return { online: this.online(), lastSeen: this.state.heartbeat }; }
  heartbeat() { this.state.heartbeat = this.now(); }
  enqueue(action) {
    const job = { id: randomUUID(), action, status: 'queued', createdAt: this.now(), result: null, attempts: 0 };
    this.state.jobs.push(job);
    return job;
  }
  claim() {
    this.heartbeat();
    const job = this.state.jobs.find(j => j.status === 'queued' || (j.status === 'running' && j.leaseUntil <= this.now()));
    if (!job) return null;
    job.status = 'running'; job.lease = randomUUID(); job.leaseUntil = this.now() + 30000; job.attempts++;
    this.save();
    return structuredClone(job);
  }
  renew(id, lease) {
    const job = this.state.jobs.find(j => j.id === id);
    if (!job || job.lease !== lease || job.status !== 'running' || job.leaseUntil <= this.now()) return false;
    this.heartbeat(); job.leaseUntil = this.now() + 30000; this.save(); return true;
  }
  complete(id, lease, result, ok) {
    const job = this.state.jobs.find(j => j.id === id);
    if (!job || job.lease !== lease || job.status !== 'running') return false;
    job.status = ok ? 'done' : 'failed'; job.result = result; job.finishedAt = this.now();
    if (job.action.type === 'codex_task') {
      this.state.messages.push({ role: 'assistant', text: ok ? result : `작업 실패: ${result}`, at: this.now() });
      this.state.messages = this.state.messages.slice(-100);
    }
    delete job.lease; delete job.leaseUntil;
    this.save(); return true;
  }
  publicJobs() { return this.state.jobs.slice(-50).reverse().map(({ lease, leaseUntil, ...job }) => job); }
}
