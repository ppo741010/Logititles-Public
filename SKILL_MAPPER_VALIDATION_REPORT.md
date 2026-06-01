# Skill Mapper Validation Report
**Date:** 2026-06-02  
**Status:** 54 missing canonical labels require remediation  

---

## Executive Summary

Out of 54 missing canonical labels in `skill_normalize.json`, this analysis categorizes them into:
- **11 items** → ADD (legitimate, framework-grounded, not yet in skills_knowledge_map)
- **25 items** → MAP TO EXISTING (consolidate with existing similar skills)
- **18 items** → REMOVE OR CONSOLIDATE (too vague, redundant, or tool-specific variants)

---

## A. ADD — New Canonical Labels (Framework-Grounded, Not Covered)

These 11 labels are legitimate, supported by ASCM SCOR / logistics frameworks, and not adequately covered by existing skills. **Add them to skills_knowledge_map.json.**

| Label | Justification | Framework | Existing Similar | Action |
|-------|---|---|---|---|
| **3PL Management** | Core logistics competency; SCOR-adjacent | SCOR/Logistics | None | Add to relevant job titles (Operations Manager, Logistics Manager, 3PL Coordinator) |
| **Incoterms** | International trade standard; freight forwarding essential | ILO/Commerce | None | Add to freight forwarding titles (Customs Compliance Officer, Trade Compliance Specialist) |
| **Lean Manufacturing** | ASCM process improvement methodology | ASCM/Operations | None | Add to process improvement roles (Continuous Improvement Manager, Lean Six Sigma Specialist) |
| **Scrum** | Agile framework; industry standard for logistics software projects | Agile/ISCO-08 Level 3 | "Agile Delivery" exists but "Scrum" is more specific | Add to IT/Systems titles (Project Manager, Systems Analyst) |
| **Six Sigma** | ASCM/operations quality methodology | ASCM/Operations | None | Add to improvement/quality roles (Continuous Improvement Manager, Process Improvement Analyst) |
| **S&OP** | Sales & Operations Planning; core SCOR "Plan" function | ASCM/Operations | "Demand Planning", "Budget Planning" exist but "S&OP" is distinct | Add to planning roles (S&OP Manager, Demand Planning Manager) |
| **TAPA** | Supply chain security standard (Transported Asset Protection Association) | Industry Standard | None | Add to security/compliance roles (Supply Chain Security Manager, Compliance Manager) |
| **TMS** | Transportation Management System; logistics standard infrastructure | ILO/Systems | "TMS Configuration" exists with 24 variants → already in use; label is missing | This is **ALREADY IN USE** — see section C |
| **VMI** | Vendor-Managed Inventory; supply chain model | SCOR/Operations | None | Add to inventory/supply chain roles (Inventory Optimization Analyst, Supply Chain Planner) |
| **EDI** | Electronic Data Interchange; supply chain communication standard | ILO/Commerce | None | Add to supply chain/IT roles (Supply Chain Analyst, Business Systems Analyst) |
| **Export/Import Documentation** | Freight forwarding specific; regulatory requirement | Commerce/Logistics | Related skills exist ("Air Waybill Processing", "Customs Compliance") but this is distinct | Add to freight titles (Export Operations Coordinator, Import Operations Coordinator) |

---

## B. MAP TO EXISTING — Consolidate With Similar Labels

These 25 items are legitimate but can be mapped to existing skills in skills_knowledge_map.json. **Update skill_normalize.json mappings only; no changes to skills_knowledge_map.json needed.**

| Missing Label | Map To (Existing Skill) | Reason | Variant Count |
|---|---|---|---|
| **EHS** | Health & Safety | European term for Health & Safety | 1 |
| **EHS Compliance** | Health & Safety Compliance | Variant of existing label | 1 |
| **HSE** | Health & Safety | Industry term for Health & Safety | 3 |
| **OHS** | Health & Safety | Australian/NZ term for Occupational Health & Safety | 1 |
| **OHS Management Systems** | Health & Safety Compliance / ISO Management Systems | Combined concept; split or map to "Compliance & Safety Standards" | 1 |
| **WHS** | Health & Safety | Work Health & Safety (Australian/NZ variant) | 3 |
| **ISO 45001** | ISO Management Systems / Compliance & Safety Standards | Specific ISO standard; covered by generic "ISO Management Systems" | 1 |
| **ISO 9001** | ISO Management Systems / Quality Standards | Quality management system; covered by generic standards | 2 |
| **GDP Compliance** | Compliance / Cold Chain Compliance | Good Distribution Practice (pharma logistics); map to "Compliance" or "Cold Chain Compliance" | 3 |
| **CRM** | CRM Data Management | Generic CRM exists as "CRM Data Entry", "CRM Data Management" | 10 |
| **Microsoft Excel** | Office Software Proficiency / Basic Excel | "Basic Excel" & "Excel Modeling" exist | 5 |
| **Microsoft Excel (Advanced)** | Excel Modeling | Advanced Excel already covered | 8 |
| **Microsoft Word** | Office Software Proficiency | Generic office software skill | 2 |
| **Microsoft PowerPoint** | Office Software Proficiency | Generic office software skill | 2 |
| **Microsoft Outlook** | Office Software Proficiency | Generic office software skill | 2 |
| **Microsoft Teams** | Office Software Proficiency / Team Communication | Generic office software | 2 |
| **Microsoft Office** | Office Software Proficiency | Generic office software (base skill exists) | 5 |
| **SharePoint** | Office Software Proficiency / Collaboration Tools | File/document collaboration tool | 2 |
| **NetSuite** | NetSuite Administration / NetSuite Configuration | Specific ERP variant; already mapped in skills_knowledge_map | 2 |
| **SAP** | SAP Systems / SAP Implementation | Core SAP skill exists but generic "SAP" label not in map | 4 |
| **Agile** | Agile Delivery | Existing label covers "agile methodology" use cases | 2 |
| **Data Visualisation** | Power BI Dashboard Development / Tableau Reports | Covered by specific BI tools | 5 |
| **Tableau** | Power BI Dashboard Development | BI tool skill (generic BI tools representation exists) | 1 |
| **Power BI** | Power BI Dashboard Development | BI tool skill; variant exists in map | 5 |
| **SLA** | Compliance / Compliance & Safety Standards | Service Level Agreement is a concept, not a learnable skill; map to "Compliance" | 1 |

---

## C. REMOVE OR CONSOLIDATE — Vague, Redundant, or Too Generic

These 18 items should be **reconsidered or removed** because they are either:
- **Too vague** (not searchable/specific)
- **Tool-specific variants** (not core competencies)
- **Already in use elsewhere** (discovered after mapping)

### C1. Remove (Too Vague or Generic)

| Label | Issue | Variants | Recommendation |
|---|---|---|---|
| **AI Tools** | Too generic; "AI/ML Product Development", "AI Project Support" already exist and are specific | 5 | Remove — use existing specific AI labels |
| **AI Automation** | Overlaps with "RPA"; unclear boundary between AI and automation | 6 | Consolidate to "Robotic Process Automation" or remove |
| **KPI** | Not a skill, it's a metric/concept | 1 | Remove — KPI usage is implicit in "Analytics" roles |
| **SOP** | Too generic; "Standard Operating Procedures" is not a learnable skill but a work artifact | 1 | Remove or narrow to "SOP Development" or "Process Documentation" |
| **SOP Adherence** | Behavioral compliance, not a skill | 1 | Remove — compliance is covered elsewhere |
| **SOP Development** | Too vague; "Process Documentation", "Compliance Procedures" exist | 1 | Map to "Process Documentation" if exists, else remove |

### C2. Keep but Consolidate with Broader Skill Labels

| Label | Issue | Consolidation | Variants |
|---|---|---|---|
| **Machine Learning** | Overlaps with "AI/ML Product Development" | Map to "AI/ML Product Development" | 2 |
| **Generative AI** | Specific AI application; overlaps with "AI Strategy Development" | Map to "AI Strategy Development" or "AI/ML Product Development" | 9 |
| **Prompt Engineering** | Modern AI skill; legitimate but niche | Keep as emerging skill OR map to "AI Project Support" | 1 |
| **RPA** | Legitimate (Robotic Process Automation); ASCM adjacent | Keep — add to automation/IT titles | 3 |
| **Predictive Analytics** | Legitimate data/analytics skill | Keep OR map to "Advanced Data Modelling" | 2 |
| **Data Science** | Legitimate; ISCO-08 professional skill (Level 4) | Keep OR map to "Advanced Data Analysis" | 1 |

### C3. Microsoft Tool Variants — Already Covered

These are **software proficiency skills** which are already represented in the map via generic "Office Software Proficiency". No need to track each tool separately for skill mapping purposes.

| Label | Issue | Recommendation |
|---|---|---|
| **GitHub Copilot** | Tool variant; "AI Project Support" covers AI-assisted development | Remove or consolidate to "AI Project Support" |
| **Microsoft Copilot** | Tool variant; "AI Project Support" covers AI assistants | Remove or consolidate to "AI Project Support" |
| **GPS Tracking Systems** | Equipment/system specific, not a learnable skill | Remove — logistics roles use GPS tools but it's not a core skill |
| **RF Scanning** | Equipment operation; niche warehouse skill | Remove OR keep as operational skill for Warehouse titles only |

### C4. Already Successfully Integrated (TMS anomaly)

| Label | Status | Why It Appears Missing | Fix |
|---|---|---|---|
| **TMS** | ✅ Already in use (24 variants!) | skill_synonyms.json maps variants to "TMS" but "TMS" itself missing from skills_knowledge_map | Add "TMS" to relevant titles (Fleet Controller, Route Planner, Load Planner) |

---

## Remediation Action Plan

### Phase 1: Update skill_normalize.json (Mapping Only)

For section B (MAP TO EXISTING), update `skill_synonyms` to point to existing canonical labels:

```json
{
  "skill_synonyms": {
    "ehs": "Health & Safety",
    "ehs compliance": "Health & Safety Compliance",
    "health safety environment": "Health & Safety",
    "hse": "Health & Safety",
    "ohs": "Health & Safety",
    "work health and safety": "Health & Safety",
    "whs": "Health & Safety",
    "agile methodology": "Agile Delivery",
    "agile project management": "Agile Delivery",
    "basic excel": "Office Software Proficiency",
    "ms excel": "Office Software Proficiency",
    "microsoft excel": "Office Software Proficiency",
    "excel proficiency": "Office Software Proficiency",
    "advanced excel": "Excel Modeling",
    "excel modeling": "Excel Modeling",
    ...
  }
}
```

### Phase 2: Add 11 New Skills to skills_knowledge_map.json

Run `regenerate_skills_map.py` with job titles that use these new skills, OR manually add them to titles where relevant:

**Suggested title assignments:**

- **3PL Management**: "Logistics Manager", "Operations Manager", "3PL Coordinator"
- **Incoterms**: "Customs Compliance Officer", "Trade Compliance Specialist", "Export Operations Coordinator"
- **Lean Manufacturing**: "Continuous Improvement Manager", "Lean Six Sigma Specialist", "Process Improvement Analyst"
- **Scrum**: "Project Manager", "Senior Project Manager", "IT Project Manager"
- **Six Sigma**: "Continuous Improvement Manager", "Lean Six Sigma Specialist"
- **S&OP**: "S&OP Manager", "Demand Planning Manager", "Supply Chain Planner"
- **TAPA**: "Compliance Manager", "Risk Manager", "Supply Chain Specialist"
- **TMS**: "Fleet Controller", "Load Planner", "Route Planner", "TMS Consultant"
- **VMI**: "Inventory Optimization Analyst", "Supply Chain Planner", "Supply Chain Analyst"
- **EDI**: "Supply Chain Analyst", "Business Systems Analyst", "Systems Analyst"
- **Export/Import Documentation**: "Export Operations Coordinator", "Import Operations Coordinator", "Customs Compliance Officer"

### Phase 3: Remove/Consolidate Questionable Labels

Delete these from `skill_synonyms`:
- ai_tools
- ai_automation (OR consolidate to RPA)
- kpi
- sop (generic)
- sop_adherence
- sop_development (consolidate if needed)
- github_copilot
- microsoft_copilot
- gps_tracking_systems
- rf_scanning (optional: keep for Warehouse Worker titles only)

---

## Validation Checklist

After applying these changes:

```bash
# 1. Run the validation script again
python3 << 'EOF'
import json
d = json.load(open('backend/json/skill_normalize.json'))
km = json.load(open('backend/json/skills_knowledge_map.json'))
km_skills = set()
for k, v in km.items():
    if not k.startswith('_') and 'skills' in v:
        for s in v['skills'].split(','):
            km_skills.add(s.strip())
missing = sorted(set(d['skill_synonyms'].values()) - km_skills)
print(f"Remaining missing: {len(missing)}")
for label in missing:
    print(f"  - {label}")
EOF

# 2. Verify no canonical labels are orphaned in skill_synonyms
# 3. Confirm job titles have been updated with new skills
# 4. Re-run skill_normalize tests
```

---

## Summary

| Category | Count | Action |
|---|---|---|
| ADD (new, framework-grounded) | 11 | Add to skills_knowledge_map |
| MAP (consolidate with existing) | 25 | Update skill_normalize.json mappings |
| REMOVE/CONSOLIDATE (too vague) | 18 | Delete or reassign variants |
| **Total** | **54** | — |

**Result**: All 54 missing labels will have explicit sources (ASCM SCOR / ILO ISCO-08 / O*NET) or be consolidated into existing canonical labels.
