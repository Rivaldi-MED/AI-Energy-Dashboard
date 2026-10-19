# UNTESTED: written without a Docker daemon available. If the build fails, use the VS Code route in docs/DASHBOARD_GUIDE.md.
FROM python:3.11-slim

WORKDIR /work
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# The project folder is mounted at run time (see docker-compose.yml), so edits persist on your machine.
EXPOSE 8888
CMD ["jupyter", "lab", "--ip=0.0.0.0", "--port=8888", "--no-browser", "--allow-root", "--ServerApp.root_dir=/work"]
