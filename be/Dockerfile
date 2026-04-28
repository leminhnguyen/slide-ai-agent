FROM python:3.12-slim

# Install system deps for PyMuPDF + marp-cli (Node)
RUN apt-get update && apt-get install -y \
    chromium \
    curl \
    fonts-liberation \
    libreoffice-impress \
    nodejs \
    npm \
    ca-certificates \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_PATH=/usr/bin/chromium

# Install marp-cli globally
RUN npm install -g @marp-team/marp-cli

WORKDIR /app

# Install Python deps
COPY pyproject.toml .
RUN pip install --no-cache-dir uv && uv pip install --system -e ".[dev]" || pip install --no-cache-dir -e .

COPY . .

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
