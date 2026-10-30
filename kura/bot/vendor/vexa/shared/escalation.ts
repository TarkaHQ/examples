export function checkEscalation(elapsed: number, timeout: number, unknown: number): any { return elapsed > timeout * .8 || unknown > 10000 ? {reason: "admission_needs_attention"} : null; }
export async function triggerEscalation(_config: any, reason: string): Promise<void> { throw new Error(`Google Meet requires attention: ${reason}`); }
export function getEscalationExtensionMs(): number { return 0; }
export function resetEscalation(): void {}
