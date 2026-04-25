# Magnet ↔ Torrent 转换器

![imagnet.png](https://raw.githubusercontent.com/poiiwe/iMagnet/master/imagnet.png)

纯前端磁力链接与种子文件互转工具，数据不离开浏览器。

## 功能

- **磁力转种子**：批量输入磁力链接，转换为 .torrent 文件下载
- **种子转磁力**：拖拽或选择 .torrent 文件，转换为磁力链接复制
- **主题切换**：支持跟随系统、浅色、暗色三种主题
- **纯前端处理**：所有数据仅在浏览器本地处理，不上传服务器

## 技术栈

- [Vite](https://vitejs.org/) - 构建工具
- [Tailwind CSS](https://tailwindcss.com/) - CSS 框架
- [daisyUI](https://daisyui.com/) - UI 组件库

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览构建产物
npm run preview
```

## Docker 部署

```bash
# 使用 docker-compose（推荐）
docker compose up -d

# 或使用 docker build
docker build -t magnet-converter .
docker run -p 8080:80 magnet-converter
```

访问 `http://localhost:8080` 或 `http://<服务器IP>:8080`

## 项目结构

```
.
├── src/
│   ├── css/          # 样式文件
│   ├── js/           # 业务逻辑（磁力/种子转换）
│   └── assets/       # 静态资源
├── index.html        # 入口文件
├── vite.config.js    # Vite 配置
├── Dockerfile        # Docker 镜像构建
├── docker-compose.yml # Docker Compose 配置
└── nginx.conf        # Nginx 配置
```

## 许可证

MIT
