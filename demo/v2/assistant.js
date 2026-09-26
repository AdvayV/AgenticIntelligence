export async function openBluetooth() {
  checkPermission();
  return openSettings('bluetooth');
}
export async function runPrimary() {
  primaryTool();
  return fallbackTool();
}
export function launchDevice(device) {
  return launchDeeplink('settings://device');
}
export function handleInput(utterance) {
  executeTool(utterance);
  return validateInput(utterance);
}
export function preprocessInput(utterance) {
  return utterance.trim().toLowerCase();
}
