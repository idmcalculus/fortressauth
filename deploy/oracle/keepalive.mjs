// Holds a fixed block of memory so Oracle Cloud does not reclaim an Always
// Free A1 VM as idle. Oracle counts an A1 VM as idle only when CPU (95th
// percentile), network and memory use all stay under 20% for 7 days, so
// keeping memory above 20% is enough on its own and costs no CPU.
import { randomFillSync } from 'node:crypto';

const megabytes = Number.parseInt(process.env.KEEPALIVE_MEMORY_MB ?? '', 10);
if (!Number.isInteger(megabytes) || megabytes < 1) {
  console.error('[keepalive] KEEPALIVE_MEMORY_MB must be a positive integer');
  process.exit(1);
}

const CHUNK_MB = 64;
const chunks = [];
for (let held = 0; held < megabytes; held += CHUNK_MB) {
  const chunk = Buffer.allocUnsafeSlow(Math.min(CHUNK_MB, megabytes - held) * 1024 * 1024);
  // Random bytes write every page, so the kernel cannot share or skip them.
  randomFillSync(chunk);
  chunks.push(chunk);
}
console.log(`[keepalive] holding ${megabytes} MB`);

// Touch each chunk hourly so the pages stay in use.
setInterval(
  () => {
    for (const chunk of chunks) chunk[0] ^= 1;
  },
  60 * 60 * 1000,
);

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => process.exit(0));
}
