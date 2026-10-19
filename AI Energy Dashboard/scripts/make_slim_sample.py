"""Make a SLIM copy of output/dashboard_data.json for attaching to an AI Studio prompt.

Why: the full file (all SEUs x 36 months) is large. The AI only needs to see the
SCHEMA and a few realistic records to build the UI; the finished app then loads the
FULL file at run time.

Keeps, per plant: the 2 worst-status SEUs (+ the load-driven SEU if the plant has an
activity note), full plant KPIs, Pareto, trend, data-quality log and method block.

Usage (from dashboard/):  python scripts/make_slim_sample.py
Result: output/dashboard_data_slim.json
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RANK = {"critical": 0, "high": 1, "watch": 2, "improved": 3, "normal": 4}

d = json.loads((ROOT / "output" / "dashboard_data.json").read_text(encoding="utf-8"))

kept = set()
for p in d["plants"]:
    seus = sorted(
        p["seus"],
        key=lambda s: (RANK.get(s["status"], 9), -abs(s["windows"]["last_3m"]["deviation_pct"] or 0)),
    )
    chosen = seus[:2]
    if p.get("activity_note"):
        chosen += [s for s in p["seus"] if s["verdict"] == "activity_driven" and s not in chosen][:1]
    p["seus"] = chosen
    kept |= {(p["plant"], s["seu"]) for s in chosen}

d["company"]["top_seus"] = [t for t in d["company"]["top_seus"] if (t["plant"], t["seu"]) in kept] or d["company"]["top_seus"][:3]
d["data_quality"] = [q for q in d["data_quality"] if (q["plant"], q["seu"]) in kept]
d["meta"]["slim_sample"] = True
d["meta"]["slim_note"] = "Subset for UI design only. The real app must load the full dashboard_data.json and render ALL SEUs it contains."

out = ROOT / "output" / "dashboard_data_slim.json"
out.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
n = sum(len(p["seus"]) for p in d["plants"])
print(f"wrote {out} ({out.stat().st_size / 1024:,.0f} KB, {n} SEUs kept)")
