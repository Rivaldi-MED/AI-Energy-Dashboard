# ISO 50001 energy performance dashboard kit

Answers four questions per plant: **which SEU drives energy and excess, why it is high, what corrective action to take, what to improve next.**

| Folder | What is in it |
|---|---|
| `notebooks/` | `energy_dashboard_analysis.ipynb` (the calculation engine), `.py` source, and an executed copy with outputs |
| `data/` | Synthetic demo data, answer key, `knowledge_base.json`, and `templates/` for your own data |
| `output/` | `dashboard_data.json` (full), `dashboard_data_slim.json` (small example for the AI prompt), `dashboard.html` (offline reference dashboard) |
| `prompts/` | `AI_STUDIO_PROMPT.md`, paste into Google AI Studio Build mode |
| `docs/` | `DASHBOARD_GUIDE.md`, the step-by-step guide (start here) |
| `scripts/` | Helpers: py to ipynb, build offline dashboard, make slim sample, make demo data and templates |

Quick start: `pip install -r requirements.txt`, open the notebook in VS Code, Run All, then open `output/dashboard.html`.
Docker files are included but untested.
