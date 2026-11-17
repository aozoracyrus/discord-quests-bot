FROM node:20-bookworm

# Cài thư viện hệ thống cho canvas, sharp, ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    ffmpeg \
    fonts-dejavu-core \
    tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package trước để tận dụng Docker cache
COPY package.json package-lock.json ./
RUN npm ci

# Copy toàn bộ source
COPY . .

# Tạo file/folder cần thiết
RUN touch proxy.txt && mkdir -p logs images dist

# Build TypeScript
RUN npm run build

ENV NODE_ENV=production
ENV TZ=Asia/Ho_Chi_Minh

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
