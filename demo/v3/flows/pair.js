import { policyCheck, openDevice } from '../tools/device.js';

export async function pairDevice(device) {
  await policyCheck(device);
  return openDevice(device, 'settings://pair-device');
}
