FROM mcr.microsoft.com/playwright:v1.56.0-noble
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg pulseaudio xvfb xauth xdotool xclip && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN chmod +x entrypoint.sh && mkdir -p /recordings /app/storage/screenshots && chown -R pwuser:pwuser /app /recordings
USER 1000:1000
EXPOSE 8081
ENTRYPOINT ["/app/entrypoint.sh"]
