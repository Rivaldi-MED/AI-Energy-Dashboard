"""Convert a '# %%' percent-format .py file into a .ipynb notebook (no jupytext needed).

Usage (from dashboard/):
    python scripts/py_to_ipynb.py notebooks/energy_dashboard_analysis.py
Then (optional) execute it:
    jupyter nbconvert --to notebook --execute --inplace notebooks/energy_dashboard_analysis.ipynb
"""
import re
import sys
from pathlib import Path

import nbformat
from nbformat.v4 import new_code_cell, new_markdown_cell, new_notebook

src = Path(sys.argv[1])
text = src.read_text(encoding="utf-8")
chunks = re.split(r"(?m)^# %%(?P<tag> \[markdown\])?\s*$", text)
# re.split with a named group returns [pre, tag1, body1, tag2, body2, ...]
cells = []
for i in range(1, len(chunks), 2):
    tag, body = chunks[i], chunks[i + 1]
    body = body.strip("\n")
    if tag:
        md = "\n".join(l[2:] if l.startswith("# ") else l.lstrip("#") for l in body.splitlines())
        cells.append(new_markdown_cell(md))
    elif body.strip():
        cells.append(new_code_cell(body))

nb = new_notebook(cells=cells)
nb.metadata["kernelspec"] = {"display_name": "Python 3", "language": "python", "name": "python3"}
nb.metadata["language_info"] = {"name": "python"}
nbformat.validate(nb)
out = src.with_suffix(".ipynb")
nbformat.write(nb, out)
print(f"wrote {out} ({len(cells)} cells)")
