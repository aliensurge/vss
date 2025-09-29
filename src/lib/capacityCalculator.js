export const VCPU_PER_1000 = 42.35;
export const RAM_PER_1000  = 144.22;
export const ENDPOINTS_PER_SU = 5000;

export function calcHeadroom({ vcpuTotal, vcpuUsedPctPeak, ramGiBTotal, ramUsedPctPeak, bufferPct = 0.30 }) {
  const vcpuAvail = vcpuTotal * (1 - vcpuUsedPctPeak) * (1 - bufferPct);
  const ramAvail  = ramGiBTotal * (1 - ramUsedPctPeak) * (1 - bufferPct);
  const headroomCpu = (vcpuAvail / VCPU_PER_1000) * 1000;
  const headroomRam = (ramAvail  / RAM_PER_1000)  * 1000;
  return { vcpuAvail, ramAvail, headroomCpu, headroomRam, safeHeadroom: Math.floor(Math.min(headroomCpu, headroomRam)) };
}

export function resourcesForEndpoints(endpoints) {
  const units = endpoints / 1000;
  return {
    addVcpu: Math.ceil(units * VCPU_PER_1000),
    addRamGiB: Math.ceil(units * RAM_PER_1000),
    sus: Math.ceil(endpoints / ENDPOINTS_PER_SU),
  };
}

export function lagMinutes(lagMessages, drainPerSec) {
  const d = Math.max(1, drainPerSec || 0);
  return (lagMessages / d) / 60;
}


export function suNeededForEndpoints(endpoints, perSu = ENDPOINTS_PER_SU) {
  return Math.ceil((endpoints || 0) / perSu);
}

export function nodePlanForSUs(susToAdd, suDef) {
  const mult = Math.max(0, susToAdd || 0);
  const d = suDef || {};
  return {
    nginx: (d.nginx || 0) * mult,
    pnode: (d.pnode || 0) * mult,
    dnode: (d.dnode || 0) * mult,
    spark: (d.spark || 0) * mult,
    ruleengine: (d.ruleengine || 0) * mult
  };
}

export function totalsFromTenants(tenants) {
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
