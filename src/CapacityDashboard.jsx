import React, { useEffect, useState } from "react";
import {
  Activity, Server, Cpu, HardDrive, Database, Sparkles, Boxes, Monitor, Layers, Shield
} from "lucide-react";
import {
  calcHeadroom, resourcesForEndpoints, lagMinutes,
  totalsFromTenants, overallHeadroomFromTenants,
  ENDPOINTS_PER_SU, suNeededForEndpoints, nodePlanForSUs, abbr
} from "./lib/capacityCalculator";

/* ============================
   MAIN COMPONENT
============================ */
export default function CapacityDashboard() {
  const [data, setData] = useState(null); // tenants + bbcloud
  const [integrations, setIntegrations] = useState({
    updatedAt: new Date().toISOString(),
    sos: { name: "SOS Scanner", lastHeartbeat: new Date().toISOString() },
    soc: { name: "SOC SIEM",    lastHeartbeat: new Date().toISOString() },
  });
  const [hdfsPayload, setHdfsPayload] = useState({
    updatedAt: new Date().toISOString(),
    hdfs: { state: "active", safeMode: false, datanodesLive: 0, datanodesExpected: 0, percentUsed: 0, underReplicatedBlocksPct: 0, ttfHours: null },
    clientConnectivity: [], mounts: []
  });

  const [whatIf, setWhatIf] = useState(60000);
  const [tenantFilter, setTenantFilter] = useState("all");
  const [drawer, setDrawer] = useState({ open: false, tenant: null });

  // Tenants + BBCloud payload
  useEffect(() => {
    fetch(`/api/tenants.json?ts=${Date.now()}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData({ tenants: [], updatedAt: new Date().toISOString() }));
  }, []);

  // Integrations (SOS/SOC) payload
  useEffect(() => {
    fetch("/api/integrations.json")
      .then(r => r.json())
      .then(setIntegrations)
      .catch(()=>{});
  }, []);

  // HDFS roll-up + connectivity payload
  useEffect(() => {
    fetch("/api/hdfs.json")
      .then(r => r.json())
      .then(setHdfsPayload)
      .catch(()=>{});
  }, []);

  if (!data) return <div className="min-h-screen bg-[#0b0c0e] text-white p-10">Loading…</div>;

  const tenants = data.tenants || [];
  const filtered = tenants.filter(t => tenantFilter === "all" || t.id === tenantFilter);

  // BBCloud totals & headroom
  const totals = totalsFromTenants(tenants);
  const bb = overallHeadroomFromTenants(tenants, 0.30);
  const cloud = data.bbcloud || {};
  const suDef = cloud.suDefinition || {};
  const susCurrent = cloud.currentSUs || 0;

  return (
    <div className="min-h-screen bg-[#0b0c0e] text-white">
      {/* Header */}
      <header className="border-b border-blue-600/40 bg-black/70 backdrop-blur">
<div className="max-w-screen-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-blue-600 grid place-items-center"><Activity className="w-5 h-5" /></div>
            <div>
              <h1 className="text-2xl font-light">Uptycs Capacity Control Plane (POC)</h1>
            </div>
          </div>
          <div className="text-sm text-gray-400">Updated {new Date(data.updatedAt || Date.now()).toLocaleString()}</div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-6 py-8">
        {/* Overview */}
        <section className="grid grid-cols-1 md:grid-cols-6 gap-5 mb-8">
          <Card title="Tenants" value={tenants.length} icon={<Server/>}/>
          <Card title="Total Endpoints" value={totals.endpoints.toLocaleString()} icon={<Cpu/>}/>
          <Card title="CNAPP Accounts" value={totals.cnapps.toLocaleString()} icon={<Database/>}/>
          <Card title="BBCloud vCPU" value={totals.vcpuTotal.toLocaleString()} icon={<Cpu/>}/>
          <Card title="BBCloud RAM (GiB)" value={totals.ramGiBTotal.toLocaleString()} icon={<HardDrive/>}/>
          <Card title="Safe Headroom (EP)" value={bb.safeHeadroom.toLocaleString()} icon={<Sparkles/>}/>
        </section>

        {/* Inventory */}
        {cloud?.nodeInventory && (
          <section className="bg-[#111318] border border-gray-800 p-6 mb-8">
            <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
              <h2 className="text-xl font-light flex items-center gap-2"><Boxes className="w-5 h-5" /> BBCloud Inventory</h2>
              <div className="text-gray-400 text-sm">
                Current SUs: <b>{susCurrent}</b> • SU = nginx {suDef.nginx||0}, pnode {suDef.pnode||0}, dnode {suDef.dnode||0}, spark {suDef.spark||0}, ruleengine {suDef.ruleengine||0}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {["nginx","pnode","dnode","spark","ruleengine"].map(k => (
                <InfoCard key={k} label={labelize(k)} value={(cloud.nodeInventory[k] ?? 0).toLocaleString()} />
              ))}
            </div>
          </section>
        )}

        {/* Tenants */}
        <section className="bg-[#111318] border border-gray-800">
          <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-light">Tenants</h2>
              <p className="text-gray-400 text-sm">Headroom = min(CPU, RAM) with 30% buffer. SU = {ENDPOINTS_PER_SU.toLocaleString()} endpoints.</p>
            </div>
            <select value={tenantFilter} onChange={e=>setTenantFilter(e.target.value)} className="bg-black/60 border border-gray-700 px-3 py-2 text-sm">
              <option value="all">All tenants</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div className="overflow-x-auto md:overflow-visible">
            <table className="w-full text-sm">
              <thead className="bg-black/40 text-gray-400 text-xs uppercase">
                <tr>
                  <Th>Tenant</Th><Th>Assets</Th><Th>CNAPP</Th><Th>K8s</Th><Th>Clusters</Th>
                  <Th>Kafka Lag</Th><Th>Inject→Drain</Th><Th>pnode</Th><Th>Headroom</Th><Th>SUs</Th><Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filtered.map(t=>{
                  const m = t.metrics || {};
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
                  const assets = t.assets || {};
                  const suUse = Math.max(1, Math.ceil((t.endpoints || 0) / ENDPOINTS_PER_SU));

                  return (
                    <tr key={t.id} className="hover:bg-white/5 cursor-pointer" onClick={()=>setDrawer({open:true, tenant:t})}>
                      <Td>{t.name}</Td>
                      <Td>
                        <div className="flex items-center gap-2 text-sm">
                          <Chip icon={<Monitor className="w-3.5 h-3.5" />} label={`${abbr(t.endpoints||0)} EP`} />
                          <Chip icon={<LinuxIcon/>} label={abbr(assets.linux||0)} />
                          <Chip icon={<AppleIcon/>} label={abbr(assets.mac||0)} />
                          <Chip icon={<WindowsIcon/>} label={abbr(assets.windows||0)} />
                        </div>
                      </Td>
                      <Td>{t.cnappAccounts?.toLocaleString?.() ?? (t.cnappProviders ? "CNAPP" : "—")}</Td>
                      <Td>{t.k8s ? `${abbr(t.k8s.clusters)}c / ${abbr(t.k8s.pods)}p / ${abbr(t.k8s.containers)}ctr` : "—"}</Td>
                      <Td><span className="text-gray-300">{(t.clusters||[]).join(", ") || "—"}</span></Td>
                      <Td>{isFinite(lagMin) ? `${lagMin.toFixed(1)}m` : "—"}</Td>
                      <Td>{isFinite(injDrain) ? `${injDrain.toFixed(2)}×` : "—"}</Td>
                      <Td>{pct(m.pnodeCpuPct)}</Td>
                      <Td>{h.safeHeadroom?.toLocaleString?.() ?? "—"}</Td>
                      <Td>{suUse}</Td>
                      <Td><Badge status={status}/></Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-3 text-xs text-gray-400 border-t border-gray-800">
            {"Signals: Kafka lag &gt; 5m, Inject &gt; Drain for &gt;10–15m, pnode CPU &gt; 75% (watch) / 85% (action), Kafka disk &gt; 70% (watch) / 80% (action)."}
          </div>
        </section>

        {/* K8s Pods */}
        {cloud?.pods && (
          <section className="mt-8 bg-[#111318] border border-gray-800 p-6">
            <h3 className="text-lg font-light mb-4">Kubernetes Pods (BBCloud)</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <InfoCard label="Total" value={(cloud.pods.total||0).toLocaleString()} />
              <InfoCard label="Running" value={(cloud.pods.running||0).toLocaleString()} />
              <InfoCard label="Pending" value={(cloud.pods.pending||0).toLocaleString()} />
              <InfoCard label="Failed" value={(cloud.pods.failed||0).toLocaleString()} />
              <InfoCard label="Succeeded" value={(cloud.pods.succeeded||0).toLocaleString()} />
            </div>
          </section>
        )}

        {/* Integrations Health */}
        {integrations && (
          <section className="mt-8 bg-[#111318] border border-gray-800 p-6">
            <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
              <h3 className="text-lg font-light">Integrations Health</h3>
              <div className="text-gray-400 text-sm">Last update {new Date(integrations.updatedAt||Date.now()).toLocaleString()}</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {["sos","soc"].map(k=>{
                const item = integrations[k]||{};
                const hb = heartbeatStatus(item.lastHeartbeat);
                return (
                  <div key={k} className="bg-black/40 p-4 border border-gray-800 flex items-center justify-between">
                    <div>
                      <div className="text-gray-400 text-xs uppercase">{item.name || k.toUpperCase()}</div>
                      <div className="text-2xl font-light">{isFinite(hb.minutes) ? `${hb.minutes.toFixed(1)} min ago` : "no data"}</div>
                      <div className="text-gray-400 text-xs mt-1">Heartbeat threshold: 15 min</div>
                    </div>
                    <Badge status={hb.status}/>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* HDFS Connectivity */}
        {hdfsPayload && (
          <section className="mt-8 bg-[#111318] border border-gray-800 p-6">
            <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-light">BBCloud Storage & HDFS Connectivity</h3>
                <Badge status={hdfsOverallStatus(hdfsPayload.hdfs)} />
              </div>
              <div className="text-gray-400 text-sm">Last update {new Date(hdfsPayload.updatedAt||Date.now()).toLocaleString()}</div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <InfoCard label="HDFS State" value={String(hdfsPayload.hdfs?.state || "unknown").toUpperCase()} />
              <InfoCard label="Live DNs" value={`${hdfsPayload.hdfs?.datanodesLive ?? 0}/${hdfsPayload.hdfs?.datanodesExpected ?? 0}`} />
              <InfoCard label="% Used" value={`${(hdfsPayload.hdfs?.percentUsed ?? 0).toFixed(1)}%`} />
              <InfoCard label="Under-rep %" value={`${(hdfsPayload.hdfs?.underReplicatedBlocksPct ?? 0).toFixed(1)}%`} />
              <InfoCard label="Time-to-Fill" value={hdfsPayload.hdfs?.ttfHours != null ? `${hdfsPayload.hdfs.ttfHours}h` : "—"} />
            </div>

            <div className="mb-6">
              <div className="text-gray-300 mb-2">Client Connectivity (last 15m)</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(hdfsPayload.clientConnectivity||[]).map(cc=>{
                  const minutes = (Date.now() - new Date(cc.lastSuccess||0).getTime())/60000;
                  const status = cc.successPct15m>95 ? "green" : cc.successPct15m>=90 ? "yellow" : "red";
                  const heartbeat = minutes>15 ? "red" : status;
                  return (
                    <div key={cc.pool} className="bg-black/40 p-4 border border-gray-800">
                      <div className="flex items-center justify-between">
                        <div className="text-gray-400 text-xs uppercase">{cc.pool}</div>
                        <Badge status={heartbeat}/>
                      </div>
                      <div className="text-2xl font-light mt-1">{(cc.successPct15m||0).toFixed(1)}%</div>
                      <div className="text-gray-400 text-xs mt-1">Last success: {isFinite(minutes) ? `${minutes.toFixed(1)} min ago` : "no data"}</div>
                      {!!(cc.failingNodes&&cc.failingNodes.length) && (
                        <div className="text-xs text-red-300 mt-2">Failing: {cc.failingNodes.map(n=>`${n.node} (${n.reason})`).join(", ")}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-gray-300 mb-2">Mounts</div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-black/40 text-gray-400 text-xs uppercase">
                    <tr><Th>Path</Th><Th>Expected Device</Th><Th>Status</Th><Th>Last Change</Th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {(hdfsPayload.mounts||[]).map(m=>(
                      <tr key={m.path} className="hover:bg-white/5">
                        <Td>{m.path}</Td>
                        <Td>{m.expectedDevice||"—"}</Td>
                        <Td><Badge status={m.status==="mounted" ? "green":"red"} /></Td>
                        <Td>{m.lastChange ? new Date(m.lastChange).toLocaleString() : "—"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* What-If */}
        <section className="mt-8 bg-[#111318] border border-gray-800 p-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="text-lg font-light">What-If: add endpoints (BBCloud)</h3>
              <p className="text-gray-400 text-sm">Compare requirement vs current BBCloud capacity (30% buffer).</p>
            </div>
            <input type="number" min="0" value={whatIf} onChange={e=>setWhatIf(parseInt(e.target.value||"0",10))}
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

      {/* Tenant Drawer */}
      <TenantDrawer drawer={drawer} setDrawer={setDrawer} />
    </div>
  );
}

/* ============================
   TENANT DRAWER
============================ */
function TenantDrawer({ drawer, setDrawer }) {
  const t = drawer.tenant;
  if (!drawer.open || !t) return null;
  const m = t.metrics || {};
  const assets = t.assets || {};
  const lagMin = lagMinutes(m.kafkaLagMessages, m.drainMsgsPerSec);
  const injDrain = ratio(m.injectMsgsPerSec, m.drainMsgsPerSec);
  const status = statusFromSignals({
    lagMin, pCpu: m.pnodeCpuPct, kDisk: m.kafkaDiskUsedPct, injDrain,
    sparkRatio: ratio(m.sparkInjectPerSec, m.sparkDrainPerSec)
  });

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={()=>setDrawer({open:false, tenant:null})}/>
      <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-[#0f1115] border-l border-gray-800 overflow-y-auto">
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-blue-600 grid place-items-center"><Layers className="w-4 h-4"/></div>
            <div>
              <div className="text-xl">{t.name}</div>
              <div className="text-xs text-gray-400">Status <Badge status={status}/></div>
            </div>
          </div>
          <button className="text-gray-300" onClick={()=>setDrawer({open:false, tenant:null})}>✕</button>
        </div>

        <div className="p-6 grid gap-6">
          {/* Assets */}
          <section className="bg-[#111318] border border-gray-800 p-4">
            <div className="text-gray-400 text-xs uppercase mb-2">Assets</div>
            <div className="text-2xl font-light mb-2">{(t.endpoints||0).toLocaleString()} endpoints</div>
            <div className="flex items-center gap-2">
              <Chip icon={<LinuxIcon/>} label={`${(assets.linux||0).toLocaleString()} Linux`} />
              <Chip icon={<AppleIcon/>} label={`${(assets.mac||0).toLocaleString()} Mac`} />
              <Chip icon={<WindowsIcon/>} label={`${(assets.windows||0).toLocaleString()} Windows`} />
            </div>
          </section>

          {/* CNAPP */}
          {(t.cnappProviders || t.cnappAccounts) && (
            <section className="bg-[#111318] border border-gray-800 p-4">
              <div className="flex items-center justify-between">
                <div className="text-gray-400 text-xs uppercase">CNAPP Footprint</div>
                <div className="text-sm text-gray-400">Total accounts: {(t.cnappAccounts||0).toLocaleString()}</div>
              </div>
              {t.cnappProviders ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                  {Object.entries(t.cnappProviders).map(([prov,vals])=>(
                    <div key={prov} className="bg-black/40 p-3 border border-gray-800">
                      <div className="text-gray-300 flex items-center gap-2">
                        <Shield className="w-4 h-4"/><span className="uppercase text-xs">{prov}</span>
                      </div>
                      <div className="text-sm mt-1 leading-6">
                        {vals.orgs!=null && <div>Orgs/Tenants: {vals.orgs ?? vals.tenants}</div>}
                        {vals.tenants!=null && vals.orgs==null && <div>Tenants: {vals.tenants}</div>}
                        {vals.accounts!=null && <div>Accounts: {vals.accounts.toLocaleString()}</div>}
                        {vals.subs!=null && <div>Subs: {vals.subs.toLocaleString()}</div>}
                        {vals.projects!=null && <div>Projects: {vals.projects.toLocaleString()}</div>}
                        {vals.resources!=null && <div>Resources: {vals.resources.toLocaleString()}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div className="text-sm text-gray-300 mt-2">Accounts: {(t.cnappAccounts||0).toLocaleString()}</div>}
            </section>
          )}

          {/* K8s */}
          {t.k8s && (
            <section className="bg-[#111318] border border-gray-800 p-4">
              <div className="text-gray-400 text-xs uppercase mb-2">Kubernetes</div>
              <div className="grid grid-cols-3 gap-3">
                <InfoCard label="Clusters" value={t.k8s.clusters.toLocaleString()} />
                <InfoCard label="Pods" value={t.k8s.pods.toLocaleString()} />
                <InfoCard label="Containers" value={t.k8s.containers.toLocaleString()} />
              </div>
            </section>
          )}

          {/* Explain status */}
          <section className="bg-[#111318] border border-gray-800 p-4">
            <div className="text-gray-400 text-xs uppercase mb-2">Explain status</div>
            <p className="text-sm text-gray-200 leading-6">{explainStatus({ t, m, lagMin, injDrain })}</p>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ============================
   SMALL UI PIECES
============================ */
function Card({ title, value, icon }) {
  const iconEl =
    React.isValidElement(icon)
      ? React.cloneElement(icon, { className: "w-5 h-5" })
      : icon;

  return (
    <div className="bg-[#111318] border border-gray-800 p-5 flex items-center justify-between">
      <div className="min-w-0">
        <p className="text-gray-400 text-xs uppercase tracking-wider">{title}</p>
        <p className="text-3xl font-light mt-1 truncate">{value}</p>
      </div>
      <div className="flex-none w-10 h-10 rounded bg-blue-600/10 text-blue-400 grid place-items-center">
        {iconEl}
      </div>
    </div>
  );
}
const Th = ({ children }) => <th className="px-5 py-3 text-left">{children}</th>;
const Td = ({ children }) => <td className="px-5 py-3 whitespace-nowrap">{children}</td>;

function Badge({ status }) {
  const map = {
    green: "bg-green-500/20 text-green-300 border-green-500/40",
    yellow: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
    red: "bg-red-500/20 text-red-300 border-red-500/40",
  };
  const label = { green: "Healthy", yellow: "Watch", red: "Action" }[status] || "—";
  return <span className={`text-xs px-2.5 py-1 border ${map[status] || "border-gray-700 text-gray-300"}`}>{label}</span>;
}

function InfoCard({ label, value }) {
  return (
    <div className="bg-black/40 p-4 border border-gray-800">
      <div className="text-gray-400 text-xs uppercase">{label}</div>
      <div className="text-2xl font-light">{value}</div>
    </div>
  );
}

function Chip({ icon, label }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-gray-700 bg-black/40 text-gray-200">
      <span className="opacity-80">{icon}</span>
      <span className="text-xs">{label}</span>
    </span>
  );
}

/* ============================
   WHAT-IF
============================ */
function WhatIfAgainstBBCloud({ endpoints, bb, suDef, susCurrent }) {
  const req = resourcesForEndpoints(endpoints);
  const vcpuDeficit = Math.max(0, req.addVcpu - Math.floor(bb.vcpuAvail));
  const ramDeficit  = Math.max(0, req.addRamGiB - Math.floor(bb.ramAvail));
  const ok = vcpuDeficit === 0 && ramDeficit === 0;

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
          <div className="text-green-300">
            {"✅ Within BBCloud buffered capacity. Proceed with K8s scale-out or per-pool adds."}
          </div>
        ) : (
          <div className="text-yellow-300">
            {"⚠️ Capacity shortfall — vCPU deficit: "}
            <b>{vcpuDeficit.toLocaleString()}</b>
            {", RAM deficit: "}
            <b>{ramDeficit.toLocaleString()} GiB</b>
            {". Add VMs (or a new cluster) then scale K8s pools."}
          </div>
        )}

        <div className="mt-3 text-gray-300">
          <div className="font-medium mb-1">SUS composition (rule of thumb):</div>
          <ul className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {["nginx", "pnode", "dnode", "spark", "ruleengine"].map((k) => (
              <li key={k} className="bg-[#0b0c0e] border border-gray-800 px-3 py-2">
                <span className="text-gray-400 text-xs uppercase">{labelize(k)}</span>
                <div className="text-lg">{(suDef?.[k] ?? 0).toLocaleString()} / SU</div>
              </li>
            ))}
          </ul>

          <div className="text-gray-400 text-xs mt-2">
            {"Current SUs: "}{susCurrent}
            {" • Adding "}{susToAdd}
            {" SU(s) \u2192 add the node counts below."}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2">
            {["nginx", "pnode", "dnode", "spark", "ruleengine"].map((k) => (
              <InfoCard
                key={k}
                label={`Add ${labelize(k)}`}
                value={(nodeAdds?.[k] ?? 0).toLocaleString()}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-blue-300 mt-3">
        <Sparkles className="w-4 h-4" />
        <span>
          {"Two levers: K8s scale-out if VM headroom exists; otherwise add VMs (or a cluster) then scale pools."}
        </span>
      </div>
    </div>
  );
}

/* ============================
   HELPERS
============================ */
function statusFromSignals({ lagMin, pCpu, kDisk, injDrain, sparkRatio }) {
  if (lagMin > 5 || pCpu > 0.85 || kDisk > 0.80 || injDrain > 1.15 || sparkRatio > 1.15) return "red";
  if (lagMin > 2 || pCpu > 0.75 || kDisk > 0.70 || injDrain > 1.05 || sparkRatio > 1.05) return "yellow";
  return "green";
}

function ratio(inj, drn) {
  const d = Math.max(1, drn || 0);
  return (inj || 0) / d;
}

function pct(x) {
  return Math.round((x || 0) * 100) + "%";
}

function labelize(k) {
  return (
    {
      nginx: "Nginx",
      pnode: "Processing",
      dnode: "Data",
      spark: "Spark",
      ruleengine: "Rule Engine",
    }[k] || k
  );
}

function heartbeatStatus(lastISO, warnMin = 10, critMin = 15) {
  if (!lastISO) return { minutes: Infinity, status: "red" };
  const minutes = (Date.now() - new Date(lastISO).getTime()) / 60000;
  const status = minutes > critMin ? "red" : minutes > warnMin ? "yellow" : "green";
  return { minutes, status };
}

function hdfsOverallStatus(h) {
  if (!h) return "yellow";
  if (h.safeMode) return "red";
  const liveRatio = h.datanodesExpected ? h.datanodesLive / h.datanodesExpected : 1;
  if (liveRatio < 0.9) return "red";
  if (h.underReplicatedBlocksPct > 5) return "red";
  if (h.ttfHours != null && h.ttfHours < 6) return "red";
  if (liveRatio < 0.95) return "yellow";
  if (h.underReplicatedBlocksPct > 1) return "yellow";
  if (h.ttfHours != null && h.ttfHours < 24) return "yellow";
  return "green";
}

function explainStatus({ t, m, lagMin, injDrain }) {
  const parts = [];
  if (isFinite(lagMin)) parts.push(`Kafka lag ${lagMin.toFixed(1)}m`);
  if (isFinite(injDrain)) parts.push(`inject>drain ${injDrain.toFixed(2)}×`);
  if (m.pnodeCpuPct != null) parts.push(`pnode CPU ${pct(m.pnodeCpuPct)}`);
  if (m.kafkaDiskUsedPct != null) parts.push(`Kafka disk ${pct(m.kafkaDiskUsedPct)}`);
  if (!parts.length) parts.push("no active alerts");
  return `${t.name} is ${
    parts.includes("no active alerts") ? "Healthy" : "degraded"
  } because ${parts.join(
    ", "
  )}. Recommend scaling the bottleneck pool first (Kafka/pnode/Presto/Spark) or adding 1 SU if onboarding is expected.`;
}

/* Mini OS icons (pure SVG) to avoid extra deps */
function LinuxIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
      <path d="M12 2c1.1 0 2 .9 2 2v2c0 .7.4 1.3 1 1.6 2.5 1.3 4 4 4 6.9 0 3.9-3.1 7-7 7s-7-3.1-7-7c0-2.9 1.5-5.6 4-6.9.6-.3 1-.9 1-1.6V4c0-1.1.9-2 2-2z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
      <path d="M16 13c.1 2.6 2.3 3.5 2.3 3.5s-1.8 5.2-4.2 5.2c-1 .1-1.8-.7-3-.7-1.2 0-2 .7-3 .7C6.6 21.7 5 18.3 5 15.8 5 12.3 7.5 11 9.8 11c1.2 0 2.1.8 3 .8 1 0 1.9-.9 3.2-.8 1 .1 1.9.5 2.6 1.2-.9.6-1.6 1.4-1.6 2.8zM14.8 5.6c.7-.8 1.2-1.9 1.1-3C14.9 2.8 13.8 3.4 13 4.2c-.6.7-1.1 1.8-1 2.8 1 .1 2-.5 2.8-1.4z" />
    </svg>
  );
}

function WindowsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
      <path d="M3 4.5l8-1.3v8.3H3V4.5zm0 15V12h8v8.8l-8-1.3zM12.5 3l8.5-1.4v9.4h-8.5V3zm0 18.9V12h8.5v9.4l-8.5-1.5z" />
    </svg>
  );
}