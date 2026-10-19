"""Build the single-file reference dashboard from output/dashboard_data.json.

Usage (from dashboard/):  python scripts/build_dashboard.py
Result: output/dashboard.html  (open in any browser, works offline, no server needed)
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def build(root: Path = ROOT) -> Path:
    tpl = (root / "app" / "dashboard_template.html").read_text(encoding="utf-8")
    data = json.loads((root / "output" / "dashboard_data.json").read_text(encoding="utf-8"))
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    marker = "/*__DATA__*/null"
    if marker not in tpl:
        sys.exit("Template marker /*__DATA__*/null not found")
    out = root / "output" / "dashboard.html"
    out.write_text(tpl.replace(marker, payload, 1), encoding="utf-8")
    return out


if __name__ == "__main__":
    p = build()
    print(f"wrote {p} ({p.stat().st_size / 1024:,.0f} KB)")
