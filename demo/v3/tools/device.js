export async function policyCheck(device) {
  return device.requestConsent();
}

export function openDevice(device, deeplink) {
  return device.navigate(deeplink);
}
