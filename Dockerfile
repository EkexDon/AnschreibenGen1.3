# ==============================================================================
# 1. Frontend Build Stage
# ==============================================================================
FROM node:20-alpine AS build-frontend
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ==============================================================================
# 2. Production Stage (Python + TeX Live + Nginx via Uvicorn/StaticFiles)
# ==============================================================================
FROM python:3.12-slim

# Install system dependencies (pdflatex, ghostscript, poppler for pdfplumber)
RUN apt-get update && apt-get install -y --no-install-recommends \
    texlive-latex-base \
    texlive-fonts-recommended \
    texlive-fonts-extra \
    texlive-latex-extra \
    texlive-lang-german \
    lmodern \
    ghostscript \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Create necessary directories
RUN mkdir -p /app/backend /app/frontend-dist

# Copy backend code
COPY backend/ /app/backend/

# Copy built frontend assets
COPY --from=build-frontend /app/frontend/dist /app/frontend-dist/

# Modify main.py to serve the frontend dist folder
RUN pip install aiofiles && \
    sed -i 's/app = FastAPI(/from fastapi.staticfiles import StaticFiles\n\napp = FastAPI(/g' /app/backend/main.py && \
    echo '\n# Serve frontend static files\napp.mount("/", StaticFiles(directory="/app/frontend-dist", html=True), name="static")\n' >> /app/backend/main.py

# Expose port
EXPOSE 8000

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

# Run Uvicorn
WORKDIR /app/backend
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
