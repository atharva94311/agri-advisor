# One container: FastAPI serves the API under /api and the built React app on /.
FROM node:24-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Same Python and scikit-learn versions the checked-in model was trained with.
FROM python:3.14-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt "scikit-learn==1.9.1"
COPY main.py ./
COPY agri_advisor/ agri_advisor/
COPY models/ models/
# Only the model weights and the rainfall lookup used at inference; no training data.
COPY data/processed/district_rainfall_normals.csv data/processed/
COPY --from=web /web/dist frontend/dist
# SQLite databases live here; mount a persistent volume at /app/db to keep farms across restarts.
RUN mkdir -p db && chmod 777 db  # Hugging Face Spaces runs the container as uid 1000
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn agri_advisor.api.web:app --host 0.0.0.0 --port ${PORT}"]
