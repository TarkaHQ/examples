FROM ghcr.io/cirruslabs/flutter:3.44.1 AS web
WORKDIR /src
COPY app/pubspec.* ./
RUN flutter pub get
COPY app/ ./
RUN flutter build web --release

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.9.5 /uv /usr/local/bin/uv
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev
COPY backend/ ./
COPY --from=web /src/build/web ./web
RUN mkdir -p staticfiles /data && useradd -u 1000 -m kura && chown -R kura:kura /app /data && chmod +x entrypoint.sh
ENV PATH="/app/.venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
USER 1000:1000
EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]
