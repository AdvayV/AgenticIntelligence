import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { directoryFiles, emptyIndex, indexVersion } from './index.js';
export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const demoQueries = ['Where did Bluetooth settings stop waiting for permission checking?', 'Find calls validateInput before executeTool', 'Find the version with removed guard for device supported', 'Find fallback without awaiting primaryTool', 'Where is the settings://device deeplink used?'];
export async function buildDemo(embedder) {
  const index = emptyIndex(), stats = [];
  for (const version of ['v1', 'v2', 'v3']) stats.push({ version, ...await indexVersion(index, { version, files: await directoryFiles(path.join(projectRoot, 'demo', version)), embedder }) });
  return { index, stats };
}
