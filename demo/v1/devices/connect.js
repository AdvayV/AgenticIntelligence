import { policyCheck, openDevice } from '../tools/device.js';

export async function connectDevice(device) {
  await policyCheck(device);
  return openDevice(device, 'settings://pair-device');
}
