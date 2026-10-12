# syntax=docker/dockerfile:1

# ---- 构建阶段 ----
FROM node:22-alpine AS builder

WORKDIR /app

# 仅拷贝依赖清单，最大化利用构建缓存
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# 拷贝源码并构建（.dockerignore 已排除 node_modules / dist / test 等）
COPY . .
RUN npm run build

# ---- 运行阶段 ----
FROM nginx:1.27-alpine

# 时区（可选，便于日志排查）
RUN apk add --no-cache tzdata

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
