export async function openBluetooth() {
  await checkPermission();
  return openSettings('bluetooth');
}
export async function runPrimary() {
  await primaryTool();
  return fallbackTool();
}
export function launchDevice(device) {
  if (device.supported) {
    return launchDeeplink('settings://device');
  }
  return null;
}
export function handleInput(utterance) {
  validateInput(utterance);
  return executeTool(utterance);
}
export function preprocessInput(utterance) {
  return utterance.trim().toLowerCase();
}
