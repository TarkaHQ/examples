FROM ubuntu:24.04 AS web
RUN apt-get update && apt-get install -y --no-install-recommends git curl unzip xz-utils zip libglu1-mesa ca-certificates && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch 3.44.1 https://github.com/flutter/flutter.git /opt/flutter && test "$(git -C /opt/flutter rev-parse HEAD)" = "924134a44c189315be2148659913dda1671cbe99"
ENV PATH="/opt/flutter/bin:$PATH"
RUN flutter config --no-analytics && flutter precache --web
WORKDIR /src
COPY app/pubspec.* ./
RUN flutter pub get
COPY app/ ./
RUN flutter build web --release --no-web-resources-cdn

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv@sha256:f459f6f73a8c4ef5d69f4e6fbbdb8af751d6fa40ec34b39a1ab469acd6e289b7 /uv /usr/local/bin/uv
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
