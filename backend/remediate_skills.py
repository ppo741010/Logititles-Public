"""
Skill Mapper Remediation Helper
Automates Phase 1 (mappings) and documents Phase 2 (additions)
Run with: python remediate_skills.py --phase 1 [--dry-run]
"""

import json
import sys
from pathlib import Path
from typing import Dict, List, Tuple

# Phase 1: MAP TO EXISTING
CONSOLIDATION_MAP = {
    # Health & Safety variants
    "ehs": "Health & Safety",
    "ehs compliance": "Health & Safety Compliance",
    "health safety environment": "Health & Safety",
    "health, safety & environment": "Health & Safety",
    "hse": "Health & Safety",
    "ohs": "Health & Safety",
    "work health and safety": "Health & Safety",
    "work health & safety": "Health & Safety",
    "whs": "Health & Safety",

    # Agile/Scrum
    "agile methodology": "Agile Delivery",
    "agile project management": "Agile Delivery",

    # Microsoft Office tools
    "basic excel": "Office Software Proficiency",
    "excel proficiency": "Office Software Proficiency",
    "ms excel": "Office Software Proficiency",
    "microsoft excel": "Office Software Proficiency",
    "excel basics": "Office Software Proficiency",
    "advanced excel": "Excel Modeling",
    "excel modeling": "Excel Modeling",
    "excel modeling & analysis": "Excel Modeling",
    "excel advanced": "Excel Modeling",
    "ms word": "Office Software Proficiency",
    "microsoft word": "Office Software Proficiency",
    "ms powerpoint": "Office Software Proficiency",
    "microsoft powerpoint": "Office Software Proficiency",
    "ms outlook": "Office Software Proficiency",
    "microsoft outlook": "Office Software Proficiency",
    "ms teams": "Office Software Proficiency",
    "microsoft teams": "Office Software Proficiency",
    "microsoft office": "Office Software Proficiency",
    "ms sharepoint": "Office Software Proficiency",
    "microsoft sharepoint": "Office Software Proficiency",

    # Standards & Compliance
    "iso 45001": "Compliance & Safety Standards",
    "iso9001": "Quality Standards",
    "iso 9001": "Quality Standards",
    "gdp": "Compliance",
    "good distribution practice": "Compliance",
    "good distribution practices": "Compliance",

    # CRM
    "crm": "CRM Data Management",

    # Data/BI (map to existing broader categories)
    "data visualisation": "Analytics & Reporting",
    "data visualization": "Analytics & Reporting",
    "tableau reports": "Analytics & Reporting",
    "power bi reports": "Analytics & Reporting",
    "power bi dashboards": "Analytics & Reporting",
    "data science": "Advanced Data Analysis",
    "predictive analytics": "Advanced Data Modelling",
    "predictive modelling": "Advanced Data Modelling",

    # ERP tools
    "netsuite erp": "NetSuite Administration",
    "oracle netsuite": "NetSuite Administration",
    "sap basis": "SAP Systems",
    "sap wm/ewm": "SAP Warehouse Management",
    "sap": "SAP Systems",

    # AI/ML
    "machine learning": "AI/ML Product Development",
    "ml": "AI/ML Product Development",
    "prompt engineering": "AI Project Support",
    "rpa": "Process Automation",
    "robotic process automation": "Process Automation",
    "process automation": "Process Automation",

    # MRP
    "mrp": "Enterprise Resource Planning",

    # Additional mappings for remaining canonicals
    "sap erp": "SAP Systems",
    "sap system": "SAP Systems",
    "sap systems": "SAP Systems",
    "power bi": "Power BI Dashboard Development",
    "powerbi": "Power BI Dashboard Development",
    "microsoft power bi": "Power BI Dashboard Development",
    "power bi reporting": "Power BI Dashboard Development",
    "power bi reports": "Power BI Dashboard Development",
    "power bi dashboards": "Power BI Dashboard Development",
    "excel": "Basic Excel",
    "microsoft excel skills": "Office Software Proficiency",
    "excel pivot": "Excel Modeling",
    "pivot table": "Excel Modeling",
    "pivot tables": "Excel Modeling",
    "excel macros": "Excel Modeling",
    "advanced excel skills": "Excel Modeling",
    "ms office": "Office Software Proficiency",
    "microsoft office suite": "Office Software Proficiency",
    "ms office suite": "Office Software Proficiency",
    "office 365": "Office Software Proficiency",
    "tableau": "Analytics & Reporting",
    "looker": "Analytics & Reporting",
    "looker studio": "Analytics & Reporting",
    "crm (customer relationship management)": "CRM Data Management",
    "crm management": "CRM Data Management",
    "crm software": "CRM Data Management",
    "crm proficiency": "CRM Data Management",
    "customer relationship management": "CRM Data Management",
    "ai strategy": "AI Strategy Development",
    "ai automation": "AI Strategy Development",
    "digital transformation": "AI Strategy Development",
    "automation strategy": "AI Strategy Development",
    "no-code": "Process Automation",
    "low-code": "Process Automation",
    "no code": "Process Automation",
    "low code": "Process Automation",
    "automation tools": "Process Automation",
    "ms copilot": "AI Project Support",
    "vmi management": "Inventory Management",

    # Additional variants for automation/picking
    "no code tools": "Process Automation",
    "picking": "Warehouse Operations",
    "order picking": "Warehouse Operations",
    "pick and pack": "Warehouse Operations",
    "vlookup": "Excel Modeling",

    # More missing variants
    "pick & pack": "Warehouse Operations",
    "pick/pack": "Warehouse Operations",
    "microsoft 365": "Office Software Proficiency",
    "customer relationship management (crm)": "CRM Data Management",
    "customer relationship management crm": "CRM Data Management",
}

# Phase 2: ADD NEW SKILLS (to be added to skills_knowledge_map.json)
NEW_SKILLS_TO_ADD = {
    "3PL Management": ["Logistics Manager", "Operations Manager"],
    "Incoterms": ["Customs Compliance Officer", "Trade Compliance Specialist", "Export Operations Coordinator"],
    "Lean Manufacturing": ["Continuous Improvement Manager", "Lean Six Sigma Specialist", "Process Improvement Analyst"],
    "Scrum": ["Project Manager", "Senior Project Manager", "IT Project Manager"],
    "Six Sigma": ["Continuous Improvement Manager", "Lean Six Sigma Specialist"],
    "S&OP": ["S&OP Manager", "Demand Planning Manager", "Supply Chain Planner"],
    "TAPA": ["Compliance Manager", "Risk Manager"],
    "TMS": ["Fleet Controller", "Load Planner", "Route Planner", "TMS Consultant"],
    "VMI": ["Inventory Optimization Analyst", "Supply Chain Planner"],
    "EDI": ["Supply Chain Analyst", "Business Systems Analyst"],
    "Export/Import Documentation": ["Export Operations Coordinator", "Import Operations Coordinator"],
}

# Phase 3: REMOVE
LABELS_TO_REMOVE = {
    "ai tools",
    "ai automation",
    "kpi",
    "sop",
    "sop adherence",
    "sop development",
    "github copilot",
    "microsoft copilot",
    "copilot",
    "gps tracking systems",
    "rf scanning",
    "ohs management systems",
    "sla",
}


def load_json(path: Path) -> dict:
    """Load JSON file with UTF-8 encoding."""
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data: dict, backup=True):
    """Save JSON file with UTF-8 encoding and optional backup."""
    if backup and path.exists():
        backup_path = path.with_suffix('.json.bak')
        backup_path.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
        print(f"  Backup created: {backup_path.name}")

    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def phase_1_consolidate(dry_run=False):
    """Apply Phase 1: Consolidate variants to existing canonical labels."""
    print("\n=== PHASE 1: Consolidate Variants ===\n")

    skill_norm_path = Path("backend/json/skill_normalize.json")
    if not skill_norm_path.exists():
        print(f"❌ File not found: {skill_norm_path}")
        return False

    data = load_json(skill_norm_path)
    original_count = len(data['skill_synonyms'])

    # Apply consolidations
    changes = 0
    for variant, canonical in CONSOLIDATION_MAP.items():
        if variant in data['skill_synonyms']:
            old_canonical = data['skill_synonyms'][variant]
            if old_canonical != canonical:
                data['skill_synonyms'][variant] = canonical
                changes += 1
                print(f"  {variant:40} → {canonical}")

    # Remove variants pointing to unwanted canonical labels AND remove them as keys
    labels_to_remove_set = set(LABELS_TO_REMOVE)
    keys_to_delete = []

    # Find all keys that map to unwanted canonical labels (case-insensitive match)
    for key, value in data['skill_synonyms'].items():
        if value.lower() in labels_to_remove_set:
            keys_to_delete.append(key)

    # Also remove exact key matches from LABELS_TO_REMOVE
    for label in LABELS_TO_REMOVE:
        if label in data['skill_synonyms']:
            keys_to_delete.append(label)

    # Delete all marked keys (avoid duplicates)
    for key in set(keys_to_delete):
        if key in data['skill_synonyms']:
            del data['skill_synonyms'][key]
            changes += 1
            print(f"  (remove) {key}")

    print(f"\n  Changes: {changes}")
    print(f"  Original variants: {original_count}")
    print(f"  New variants:      {len(data['skill_synonyms'])}")

    if not dry_run and changes > 0:
        save_json(skill_norm_path, data)
        print(f"  ✅ Saved: {skill_norm_path}")
    elif dry_run:
        print(f"  (dry-run: not saved)")

    return True


def phase_2_document():
    """Document Phase 2: New skills to add (manual step)."""
    print("\n=== PHASE 2: New Skills (Manual Addition) ===\n")

    skills_map_path = Path("backend/json/skills_knowledge_map.json")
    skills_map = load_json(skills_map_path)

    print("To add these skills to job titles, use regenerate_skills_map.py or manually update:")
    print()

    for skill, job_titles in NEW_SKILLS_TO_ADD.items():
        print(f"  {skill}")
        for title in job_titles:
            if title in skills_map:
                current_skills = skills_map[title].get('skills', '')
                print(f"    → {title}: add '{skill}' to: {current_skills}")
            else:
                print(f"    → {title}: (title not in map, add when created)")
        print()


def validate_remapped():
    """Verify all variants now map to existing canonical labels."""
    print("\n=== VALIDATION: Check Remapped Skills ===\n")

    skill_norm_path = Path("backend/json/skill_normalize.json")
    skills_map_path = Path("backend/json/skills_knowledge_map.json")

    data = load_json(skill_norm_path)
    skills_map = load_json(skills_map_path)

    # Collect all canonical labels
    km_skills = set()
    for k, v in skills_map.items():
        if not k.startswith('_') and 'skills' in v:
            for s in v['skills'].split(','):
                km_skills.add(s.strip())

    # Check for orphans
    all_canonicals = set(data['skill_synonyms'].values())
    missing = sorted(all_canonicals - km_skills)

    if missing:
        print(f"⚠️  Still missing {len(missing)} canonical labels in skills_knowledge_map:")
        for label in missing:
            print(f"  - {label}")
        print("\n  These need Phase 2 (manual addition) or removal.")
    else:
        print("✅ All canonical labels have existing mappings!")

    print(f"\nTotal unique canonicals: {len(all_canonicals)}")
    print(f"Total existing skills:   {len(km_skills)}")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    phase = sys.argv[1] if len(sys.argv) > 1 else None
    dry_run = "--dry-run" in sys.argv

    if phase == "1":
        phase_1_consolidate(dry_run=dry_run)
        print("\n→ Next: Review changes and run Phase 2")
    elif phase == "2":
        phase_2_document()
        print("\n→ Next: Manually update skills_knowledge_map.json or run regenerate_skills_map.py")
    elif phase == "validate":
        validate_remapped()
    elif phase == "all":
        phase_1_consolidate(dry_run=dry_run)
        phase_2_document()
        validate_remapped()
    else:
        print(f"Unknown phase: {phase}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
