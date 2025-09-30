export const VCPU_PER_1000 = 42.35;
export const RAM_PER_1000  = 144.22;     // GiB
export const ENDPOINTS_PER_SU = 5000;

export function calcHeadroom({ vcpuTotal = 0, vcpuUsedPctPeak = 0, ramGiBTotal = 0, ramUsedPctPeak = 0, bufferPct = 0.30 }) {
  const vcpuAvail = Math.max(0, vcpuTotal * (1 - vcpuUsedPctPeak) * (1 - bufferPct));
  const ramAvail  = Math.max(0, ramGiBTotal * (1 - ramUsedPctPeak) * (1 - bufferPct));
  const headroomCpu = (vcpuAvail / VCPU_PER_1000) * 1000;
  const headroomRam = (ramAvail  / RAM_PER_1000)  * 1000;
  return { vcpuAvail, ramAvail, headroomCpu, headroomRam, safeHeadroom: Math.floor(Math.min(headroomCpu, headroomRam)) };
}

export function resourcesForEndpoints(endpoints = 0) {
  const units = endpoints / 1000;
  return {
    addVcpu: Math.ceil(units * VCPU_PER_1000),
    addRamGiB: Math.ceil(units * RAM_PER_1000),
    sus: Math.ceil(endpoints / ENDPOINTS_PER_SU),
  };
}

export function lagMinutes(lagMessages = 0, drainPerSec = 1) {
  const d = Math.max(1, drainPerSec || 0);
  return (lagMessages / d) / 60;
}

export function totalsFromTenants(tenants = []) {
  const sums = tenants.reduce((acc, t) => {
    const m = t.metrics || {};
    acc.vcpuTotal += m.vcpuTotal || 0;
    acc.ramGiBTotal += m.ramGiBTotal || 0;
    acc.vcpuUsed   += (m.vcpuTotal || 0) * (m.vcpuUsedPctPeak || 0);
    acc.ramUsed    += (m.ramGiBTotal || 0) * (m.ramUsedPctPeak || 0);
    acc.endpoints  += t.endpoints || 0;
    acc.cnapps     += t.cnappAccounts || 0;
    return acc;
  }, { vcpuTotal:0, ramGiBTotal:0, vcpuUsed:0, ramUsed:0, endpoints:0, cnapps:0 });

  const vcpuUsedPctPeak = sums.vcpuTotal ? (sums.vcpuUsed / sums.vcpuTotal) : 0;
  const ramUsedPctPeak  = sums.ramGiBTotal ? (sums.ramUsed / sums.ramGiBTotal) : 0;

  return { ...sums, vcpuUsedPctPeak, ramUsedPctPeak };
}

export function overallHeadroomFromTenants(tenants, bufferPct = 0.30) {
  const t = totalsFromTenants(tenants);
  return {
    ...calcHeadroom({
      vcpuTotal: t.vcpuTotal,
      vcpuUsedPctPeak: t.vcpuUsedPctPeak,
      ramGiBTotal: t.ramGiBTotal,
      ramUsedPctPeak: t.ramUsedPctPeak,
      bufferPct
    }),
    totals: t
  };
}

export function suNeededForEndpoints(endpoints, perSu = ENDPOINTS_PER_SU) {
  return Math.ceil((endpoints || 0) / perSu);
}

export function nodePlanForSUs(susToAdd, suDef = {}) {
  const mult = Math.max(0, susToAdd || 0);
  return {
    nginx: (suDef.nginx || 0) * mult,
    pnode: (suDef.pnode || 0) * mult,
    dnode: (suDef.dnode || 0) * mult,
    spark: (suDef.spark || 0) * mult,
    ruleengine: (suDef.ruleengine || 0) * mult
  };
}

export function abbr(n = 0) {
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n/1e9).toFixed(1).replace(/\.0$/,"") + "B";
  if (abs >= 1e6) return (n/1e6).toFixed(1).replace(/\.0$/,"") + "M";
  if (abs >= 1e3) return (n/1e3).toFixed(1).replace(/\.0$/,"") + "k";
  return String(n);
}
