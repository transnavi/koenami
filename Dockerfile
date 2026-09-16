FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py acoustics.py signals.py curation.py ./
COPY .deploy/data/ ./data/
ENV KOENAMI_PUBLIC=1 KOENAMI_DATA=/app/data
USER 65534:65534
EXPOSE 8080
CMD ["python", "server.py", "--port", "8080"]
