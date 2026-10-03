# Wenying-imgbed

基于 CloudFlare-ImgBed 和 Sanyue-ImgHub 的前后端一体仓库，保留上游 MIT 许可。

- 后端：根目录 `functions/`、`deploy/server/`
- 前端源码：`frontend/`
- 前端构建产物由 Docker 构建时生成；本地运行请先执行 `npm run build:frontend`。
- 持久化：Docker 挂载 `/app/data`；R2、Hugging Face、Telegram 为可选存储渠道。

## 本地构建

```sh
npm ci
npm --prefix frontend ci
npm run build:frontend
```

## Docker

```sh
docker build -t wenying-imgbed .
docker compose up -d
```

参考 `docker-compose.yml`，将端口绑定到回环地址并通过 HTTPS 反向代理访问。令牌和密码通过宿主机环境文件提供，切勿提交。已有生产服务器的数据和凭证不包含在本仓库。

本仓库初始化时合并了当前前后端源码和修复。本仓库只包含项目源码和部署配置，不包含测试、运行数据、缓存或自动部署工作流。

## 上游

- https://github.com/MarSeventh/CloudFlare-ImgBed
- https://github.com/MarSeventh/Sanyue-ImgHub

许可证见根目录及 `frontend/LICENSE`。
