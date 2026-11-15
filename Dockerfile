FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . ./
ENV DATA_DIR=/mnt/workspace/purplebook
# nginx on the host reaches the published port from the docker bridge
# (172.17.0.1 by default). Keep this list narrow; publish the host port to
# 127.0.0.1 only.
ENV FORWARDED_ALLOW_IPS=127.0.0.1,172.17.0.1
EXPOSE 7860
# 容器内仍监听 0.0.0.0（端口映射到宿主机时必须这样），但宿主机发布端口
# 应限定为 127.0.0.1。--proxy-headers 让 request.url.scheme 采用 nginx 的
# X-Forwarded-Proto，Secure Cookie / HSTS / 重定向才会按 https 处理。
ENTRYPOINT ["python", "-u", "-m", "uvicorn", "app:app", "--app-dir", "/app", "--host", "0.0.0.0", "--port", "7860", "--no-access-log", "--proxy-headers"]
