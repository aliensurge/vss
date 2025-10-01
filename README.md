
# Uptycs Capacity Control Plane (POC)

A lightweight, IBM-style dashboard that helps plan and operate **Uptycs** capacity as we transition from SaaS → **self-hosted on IBM Cloud (BBCloud)**. It answers:

- **Can our clusters handle the next onboarding?**
- **Which pool is the bottleneck (Kafka / pnode / Spark / Presto)?**
- **How many SUs, vCPU, and RAM do we need?**
- **Are integrations (SOS/SIEM) healthy? Is HDFS mounted and writable?**

---

## Features

- **BBCloud Overview** — tenants, total endpoints, CNAPP accounts, vCPU/RAM totals, and safe headroom (EP).
- **BBCloud Inventory** — shows current **SU definition** (e.g., `nginx 12, pnode 12, dnode 12, spark 6, ruleengine 2`) and total node counts across the fleet.
- **Tenants Table** — per-tenant endpoints + OS breakdown (Linux/Mac/Windows), CNAPP footprint, clusters, Kafka lag, inject→drain, pnode CPU, headroom, and health badge.

<img width="1900" height="969" alt="image" src="https://github.com/user-attachments/assets/3561ef41-4849-4e47-b391-b87c3fe7fb30" />


- **Tenant Drawer** — click a tenant to see OS mix, CNAPP (AWS/GCP/Azure), optional K8s stats, and a plain-English **“Explain status”** summary.

<img width="1730" height="861" alt="image" src="https://github.com/user-attachments/assets/4ff3fc4b-710a-478e-9dbc-55a4f0f8d9c4" />

 
- **Kubernetes Pods Panel** — total/running/pending/failed/succeeded pods for BBCloud.
- **Integrations Health + 🤖 Troubleshooter** — heartbeat cards for **SOS Scanner** and **SOC SIEM**; if stale, a **playbook drawer** suggests checks/fixes (copy-to-clipboard, links).
- **HDFS & Storage Health** — live DN ratio, % used, under-replicated %, time-to-fill, client connectivity (last 15m), and **mount status** (detects dismounted HDFS).

<img width="1824" height="972" alt="image" src="https://github.com/user-attachments/assets/c700961d-c93f-4807-9ef4-46d6f1e58348" />


- **What-If Calculator** — enter endpoints to add → get **SUs**, required **vCPU/RAM**, and an auto-plan of **node adds by pool**. Shows whether you can **scale out K8s** or must **add VMs / cluster** first.

<img width="1591" height="670" alt="image" src="https://github.com/user-attachments/assets/3e9cf186-8d2b-4028-aa35-5cce1398132f" />



---

## Capacity math (how it works)

- **Headroom (EP)** = `min( CPU_headroom, RAM_headroom )` with a **30% safety buffer**.
- **Rule-of-thumb**: **1 SU ≈ 5,000 endpoints**.
- **Per-1,000 endpoints** (approx.): **~42.35 vCPU** and **~144.22 GiB RAM**.  
  > Used for what-if sizing; treat as an approximation.

- **Operational watch/action** (signals shown under the Tenants table):
  - Kafka lag **> 5m**  
  - Inject **>** Drain for **>10–15m**  
  - pnode CPU **> 75% watch / > 85% action**  
  - Kafka disk **> 70% watch / > 80% action**

---

## Local API (editable JSON)

Edit these to demo new tenants or simulate incidents:

```
public/api/tenants.json       # tenants, metrics, k8s, SU definition, inventory
public/api/integrations.json  # SOS/SIEM last heartbeat timestamps
public/api/playbooks.json     # Troubleshooter playbooks (checks/actions)
public/api/hdfs.json          # HDFS health, client connectivity, mounts
```
  > To be replaced with actual API data after integration

---

## Quick start (Errors noticed during runs development of site)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install --lts
nvm use --lts

# prerequisites: Node 18+ (npm included)
npm install  
npm run dev   # open http://localhost:5173
```

If hot-reload gets “hook order” errors after you edit code:
```bash
rm -rf node_modules/.vite
npm run dev
```
<img width="1907" height="910" alt="image" src="https://github.com/user-attachments/assets/8bd52976-910d-43d8-8254-da0aa5074b71" />

---

## “AI” Troubleshooter (SOS/SIEM)

When **heartbeat > 15m**, a 🤖 button appears. Clicking it opens a drawer that:

<img width="1510" height="213" alt="image" src="https://github.com/user-attachments/assets/14e8d27f-d7c3-427a-b842-d7be446fa877" />

### Possible features within AI Troubleshooter "agent" ###

- Ranks **likely causes** (token expired, DNS/egress, endpoint down…)
- Lists **checks** (copy to clipboard kubectl/curl commands)
- Offers **actions** (restart rollout, rotate secrets, open portal links)
- Lets you jot **notes** and auto-generates a **draft incident summary**

<img width="1722" height="966" alt="image" src="https://github.com/user-attachments/assets/2e294e06-d6a0-4969-bfb4-7b4d0e3b097b" />


<img width="1728" height="960" alt="image" src="https://github.com/user-attachments/assets/a3698192-e97d-432a-ba86-38b7bbfa5283" />

> Playbooks are editable in `public/api/playbooks.json`.

---

## What-If planning (SUs & node adds)

- Input endpoints → we calculate needed **SUs**, **vCPU**, **RAM**.
- If current vCPU/RAM headroom covers it → **scale K8s**.
- Otherwise → **add VMs / a cluster**, then scale pools.
- Shows **per-pool node adds** based on the current SU definition.

---

## Roadmap

- Wire real Grafana queries (Kafka lag, pnode CPU, Spark inject/drain)
- Create data-friendly visuals (Line charts, Bar graphs, easy on eyes)
- Presto query health + slow-query watch
- Alerting webhooks and runbooks
- Cost model (vCPU/RAM per cloud zone) 

---

## Version history (high level overview)

**v1.8 – Integrations + AI helper**  
- Integrations Health (SOS/SIEM) with **heartbeat badges**  
- **🤖 Troubleshooter Drawer** with hypotheses, checks, actions, notes & summary  
- Copy-to-clipboard and external portal links

**v1.7 – HDFS & Storage**  
- HDFS roll-up (state, live/expected, % used, under-rep %, TTF)  
- Client connectivity (last 15m) and **mount checks** (detect dismounts)

**v1.6 – K8s Pods**  
- BBCloud pods panel: total/running/pending/failed/succeeded

**v1.5 – SU Definition & Inventory**  
- BBCloud inventory cards and **current SU composition** banner  
- Node counts across nginx/pnode/dnode/spark/ruleengine

**v1.4 – API-backed data**  
- Moved to local JSON APIs under `public/api/*`  
- Added Watson2 and CNAPP provider shapes (AWS/GCP/Azure)

**v1.3 – Tenant Drawer**  
- Click row → assets, CNAPP footprint, K8s, and **Explain status** summary

**v1.2 – IBM-style UI pass**  
- Dark theme, compact tables, badges & chips, iconography

**v1.1 – What-If Calculator**  
- SU math (5k EP per SU), vCPU/RAM estimates, and node add plan

**v1.0 – Baseline**  
- Overview cards, Tenants table, headroom math with 30% buffer

---

