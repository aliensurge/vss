import React, { useEffect, useState } from "react";
import { Activity, Server, Cpu, HardDrive, Database, Sparkles, Boxes } from "lucide-react";
import {
  calcHeadroom, resourcesForEndpoints, lagMinutes,
  totalsFromTenants, overallHeadroomFromTenants, ENDPOINTS_PER_SU,
  suNeededForEndpoints, nodePlanForSUs
} from "./lib/capacityCalculator";

export default function CapacityDashboard() {
  const [data, setData] = useState(null);
  const [whatIf, setWhatIf] = useState(60000);
  const [tenantFilter, setTenantFilter] = useState("all");

  useEffect(() => {
    fetch("/api/tenants.json")
      .then(r => r.json())
      .then(setData)
      .catch(() => setData({ tenants: [], updatedAt: new Date().toISOString() }));
  }, []);

  if (!data) return <div className="min-h-screen bg-[#0b0c0e] text-white p-10">Loading…</div>;

  const tenants = data.tenants || [];
  const filtered = tenants.filter(t => tenantFilter === "all" || t.id === tenantFilter);

  // BBCloud totals & headroom
  const totals = totalsFromTenants(tenants);
  const bb = overallHeadroomFromTenants(tenants, 0.30); // 30% buffer
  const cloud = data.bbcloud || {};
  const suDef = cloud.suDefinition || {};
  const susCurrent = cloud.currentSUs || 0;

  return (
    <div className="min-h-screen bg-[#0b0c0e] text-white">
      <header className="border-b border-blue-600/40 bg-black/70 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-blue-600 grid place-items-center"><Activity className="w-5 h-5"/></div>
            <div>
              <h1 className="text-2xl font-light">Uptycs Capacity Control Plane (POC)</h1>
            </div>
          </div>
          <div className="text-sm text-gray-400">Updated {new Date(data.updatedAt).toLocaleString()}</div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* BBCloud overview */}
        <section className="grid grid-cols-1 md:grid-cols-6 gap-5 mb-8">
          <Card title="Tenants" value={tenants.length} icon={<Server/>}/>
          <Card title="Total Endpoints" value={totals.endpoints.toLocaleString()} icon={<Cpu/>}/>
          <Card title="CNAPP Accounts" value={totals.cnapps.toLocaleString()} icon={<Database/>}/>
          <Card title="BBCloud vCPU" value={totals.vcpuTotal.toLocaleString()} icon={<Cpu/>}/>
          <Card title="BBCloud RAM (GiB)" value={totals.ramGiBTotal.toLocaleString()} icon={<HardDrive/>}/>
          <Card title="Safe Headroom (EP)" value={bb.safeHeadroom.toLocaleString()} icon={<Sparkles/>}/>
        </section>

        {/* NEW: BBCloud node inventory (per node type) */}
        <section className="bg-[#111318] border border-gray-800 p-6 mb-8">
          <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
            <h2 className="text-xl font-light flex items-center gap-2"><Boxes className="w-5 h-5"/> BBCloud Inventory</h2>
            <div className="text-gray-400 text-sm">
              Current SUs: <b>{susCurrent}</b> • SU definition → nginx {suDef.nginx || 0}, pnode {suDef.pnode || 0}, dnode {suDef.dnode || 0}, spark {suDef.spark || 0}, ruleengine {suDef.ruleengine || 0}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {["nginx","pnode","dnode","spark","ruleengine"].map(k => (
              <InfoCard key={k} label={labelize(k)} value={(cloud.nodeInventory?.[k] ?? 0).toLocaleString()} />
            ))}
          </div>
        </section>

        {/* Tenants table */}
        <section className="bg-[#111318] border border-gray-800">
          <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-light">Tenants</h2>
              <p className="text-gray-400 text-sm">
                Headroom = min(CPU, RAM) with 30% buffer. SU = {ENDPOINTS_PER_SU.toLocaleString()} endpoints.
              </p>
            </div>
            <select value={tenantFilter} onChange={e=>setTenantFilter(e.target.value)}
              className="bg-black/60 border border-gray-700 px-3 py-2 text-sm">
              <option value="all">All tenants</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-black/40 text-gray-400 text-xs uppercase">
                <tr>
                  <Th>Tenant</Th><Th>Endpoints</Th><Th>CNAPP</Th><Th>Clusters</Th>
                  <Th>Kafka Lag (min)</Th><Th>Inject→Drain</Th><Th>pnode CPU</Th>
                  <Th>Headroom</Th><Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filtered.map(t=>{
                  const m = t.metrics;
                  const h = calcHeadroom(m);
                  const lagMin = lagMinutes(m.kafkaLagMessages, m.drainMsgsPerSec);
                  const injDrain = ratio(m.injectMsgsPerSec, m.drainMsgsPerSec);
                  const status = statusFromSignals({
                    lagMin,
                    pCpu: m.pnodeCpuPct,
                    kDisk: m.kafkaDiskUsedPct,
                    injDrain,
                    sparkRatio: ratio(m.sparkInjectPerSec, m.sparkDrainPerSec)
                  });
                  return (
                    <tr key={t.id} className="hover:bg-white/5">
                      <Td>{t.name}</Td>
                      <Td>{t.endpoints.toLocaleString()}</Td>
                      <Td>{t.cnappAccounts}</Td>
                      <Td><span className="text-gray-300">{t.clusters.join(", ")}</span></Td>
                      <Td>{lagMin.toFixed(1)}m</Td>
                      <Td>{injDrain.toFixed(2)}×</Td>
                      <Td>{pct(m.pnodeCpuPct)}</Td>
                      <Td>{h.safeHeadroom.toLocaleString()}</Td>
                      <Td><Badge status={status}/></Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-3 text-xs text-gray-400 border-t border-gray-800">
            Signals: Kafka lag &gt; 5m, Inject &gt; Drain for &gt;10–15m, pnode CPU &gt; 75% (watch) / 85% (action), Kafka disk &gt; 70% (watch) / 80% (action).
          </div>
        </section>

        {/* NEW: Kubernetes pods overview */}
        <section className="mt-8 bg-[#111318] border border-gray-800 p-6">
          <h3 className="text-lg font-light mb-4">Kubernetes Pods (BBCloud)</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <InfoCard label="Total" value={(cloud.pods?.total ?? 0).toLocaleString()} />
            <InfoCard label="Running" value={(cloud.pods?.running ?? 0).toLocaleString()} />
            <InfoCard label="Pending" value={(cloud.pods?.pending ?? 0).toLocaleString()} />
            <InfoCard label="Failed" value={(cloud.pods?.failed ?? 0).toLocaleString()} />
            <InfoCard label="Succeeded" value={(cloud.pods?.succeeded ?? 0).toLocaleString()} />
          </div>
        </section>

        {/* What-If (BBCloud) + SUS plan */}
        <section className="mt-8 bg-[#111318] border border-gray-800 p-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="text-lg font-light">What-If: add endpoints (BBCloud)</h3>
              <p className="text-gray-400 text-sm">Compare requirement vs current BBCloud capacity (30% buffer).</p>
            </div>
            <input type="number" min="0" value={whatIf}
              onChange={e=>setWhatIf(parseInt(e.target.value||"0",10))}
              className="bg-black/60 border border-gray-700 px-3 py-2 w-44 text-right"/>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <InfoCard label="Current vCPU total" value={totals.vcpuTotal.toLocaleString()} />
            <InfoCard label="Current RAM total (GiB)" value={totals.ramGiBTotal.toLocaleString()} />
            <InfoCard label="Safe headroom (endpoints)" value={bb.safeHeadroom.toLocaleString()} />
          </div>

          <WhatIfAgainstBBCloud endpoints={whatIf} bb={bb} suDef={suDef} susCurrent={susCurrent} />
        </section>
      </main>
    </div>
  );
}

/* ---------- small components ---------- */
function Card({title, value, icon}) {
  return (
    <div className="bg-[#111318] border border-gray-800 p-5 flex items-center justify-between">
      <div>
        <p className="text-gray-400 text-xs uppercase tracking-wider">{title}</p>
        <p className="text-3xl font-light mt-1">{value}</p>
      </div>
      <div className="text-blue-400">{icon}</div>
    </div>
  );
}
const Th = ({children}) => <th className="px-5 py-3 text-left">{children}</th>;
const Td = ({children}) => <td className="px-5 py-3 whitespace-nowrap">{children}</td>;

function Badge({status}) {
  const map = {
    green: "bg-green-500/20 text-green-300 border-green-500/40",
    yellow: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
    red: "bg-red-500/20 text-red-300 border-red-500/40"
  };
  const label = {green:"Healthy", yellow:"Watch", red:"Action"}[status];
  return <span className={`text-xs px-2.5 py-1 border ${map[status]}`}>{label}</span>;
}

function InfoCard({label, value}) {
  return (
    <div className="bg-black/40 p-4 border border-gray-800">
      <div className="text-gray-400 text-xs uppercase">{label}</div>
      <div className="text-2xl font-light">{value}</div>
    </div>
  );
}

function WhatIfAgainstBBCloud({ endpoints, bb, suDef, susCurrent }) {
  const req = resourcesForEndpoints(endpoints);
  const vcpuDeficit = Math.max(0, req.addVcpu - Math.floor(bb.vcpuAvail));
  const ramDeficit  = Math.max(0, req.addRamGiB - Math.floor(bb.ramAvail));
  const ok = vcpuDeficit === 0 && ramDeficit === 0;

  // SUS math + node plan
  const susToAdd = suNeededForEndpoints(endpoints, ENDPOINTS_PER_SU);
  const nodeAdds = nodePlanForSUs(susToAdd, suDef);

  return (
    <div className="mt-4 grid grid-cols-1 gap-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoCard label="SUs needed (5k EP each)" value={susToAdd} />
        <InfoCard label="vCPU required" value={req.addVcpu.toLocaleString()} />
        <InfoCard label="RAM GiB required" value={req.addRamGiB.toLocaleString()} />
      </div>

      <div className="bg-black/40 p-4 border border-gray-800 text-sm">
        {ok ? (
          <div className="text-green-300">✅ Within BBCloud buffered capacity. Proceed with K8s scale-out or per-pool adds.</div>
        ) : (
          <div className="text-yellow-300">
            ⚠️ Capacity shortfall — vCPU deficit: <b>{vcpuDeficit.toLocaleString()}</b>, RAM deficit: <b>{ramDeficit.toLocaleString()} GiB</b>.
            Add VMs (or a new cluster) then scale K8s pools.
          </div>
        )}
        <div className="mt-3 text-gray-300">
          <div className="font-medium mb-1">SUS composition (per your rule of thumb):</div>
          <ul className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {["nginx","pnode","dnode","spark","ruleengine"].map(k => (
              <li key={k} className="bg-[#0b0c0e] border border-gray-800 px-3 py-2">
                <span className="text-gray-400 text-xs uppercase">{labelize(k)}</span>
                <div className="text-lg">{(suDef?.[k] ?? 0).toLocaleString()} / SU</div>
              </li>
            ))}
          </ul>
          <div className="text-gray-400 text-xs mt-2">Current SUs: {susCurrent} • Adding {susToAdd} SU(s) → add the node counts below.</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2">
            {["nginx","pnode","dnode","spark","ruleengine"].map(k => (
              <InfoCard key={k} label={`Add ${labelize(k)}`} value={(nodeAdds?.[k] ?? 0).toLocaleString()} />
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-blue-300">
        <Sparkles className="w-4 h-4"/>
        <span>Two levers: K8s scale-out if VM headroom exists; otherwise add VMs (or a cluster) then scale pools.</span>
      </div>
    </div>
  );
}

/* ---------- helpers / health ---------- */
function statusFromSignals({ lagMin, pCpu, kDisk, injDrain, sparkRatio }) {
  if (lagMin > 5 || pCpu > 0.85 || kDisk > 0.80 || injDrain > 1.15 || sparkRatio > 1.15) return "red";
  if (lagMin > 2 || pCpu > 0.75 || kDisk > 0.70 || injDrain > 1.05 || sparkRatio > 1.05) return "yellow";
  return "green";
}
function ratio(inj, drn){ const d = Math.max(1, drn || 0); return (inj || 0)/d; }
function pct(x){ return Math.round((x || 0)*100) + "%"; }
function labelize(k){ return ({nginx:"Nginx", pnode:"Processing", dnode:"Data", spark:"Spark", ruleengine:"Rule Engine"})[k] || k; }
