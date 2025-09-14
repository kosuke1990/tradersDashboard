# ===== マルチステージビルドで最適化 =====
FROM python:3.11-slim as builder

# ビルド用の依存関係をインストール
RUN apt-get update && apt-get install -y \
    build-essential \
    gcc \
    g++ \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Python依存関係のビルド
WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ===== 本番イメージ =====
FROM python:3.11-slim

# メタデータ
LABEL maintainer="sector-rotation-dashboard"
LABEL version="2.0.0"
LABEL description="Enhanced Sector Rotation Dashboard with Database Integration"

# 非rootユーザーの作成
RUN groupadd -r appuser && useradd -r -g appuser appuser

# システム依存関係のインストール（最小限）
RUN apt-get update && apt-get install -y \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# ビルドステージからPythonパッケージをコピー
COPY --from=builder /root/.local /home/appuser/.local

# 作業ディレクトリの設定
WORKDIR /app

# アプリケーション用ディレクトリの作成
RUN mkdir -p /app/logs /app/static /app/sql && \
    chown -R appuser:appuser /app

# Pythonパスの設定
ENV PATH=/home/appuser/.local/bin:$PATH
ENV PYTHONPATH=/app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 先にrequirements.txtをコピーしてライブラリをインストール
# （Dockerのレイヤーキャッシュを活用）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ソースコードをすべてコピー
COPY . .

# 適切な権限設定
RUN chown -R appuser:appuser /app

# ヘルスチェック用のスクリプトを追加
COPY <<EOF /app/healthcheck.py
#!/usr/bin/env python3
import sys
import asyncio
import aiohttp
import os

async def health_check():
    try:
        port = os.getenv('PORT', '8001')
        timeout = aiohttp.ClientTimeout(total=10)
        
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(f'http://localhost:{port}/health') as response:
                if response.status == 200:
                    data = await response.json()
                    if data.get('status') == 'healthy':
                        print("✅ Health check passed")
                        sys.exit(0)
                    else:
                        print("❌ Application unhealthy")
                        sys.exit(1)
                else:
                    print(f"❌ HTTP {response.status}")
                    sys.exit(1)
    except Exception as e:
        print(f"❌ Health check failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(health_check())
EOF

# ヘルスチェックスクリプトを実行可能にする
RUN chmod +x /app/healthcheck.py

# 非rootユーザーに切り替え
USER appuser

# ポート公開
EXPOSE 8001

# ヘルスチェック設定
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python /app/healthcheck.py

# 本番環境用の設定
ENV ENVIRONMENT=production
ENV DEBUG=false

# Uvicornサーバーをワーカープロセス数を自動調整して起動
CMD ["sh", "-c", "\
    WORKERS=${WORKERS:-$(nproc)}; \
    echo \"Starting with $WORKERS workers...\"; \
    uvicorn processing:app \
        --host 0.0.0.0 \
        --port 8001 \
        --workers $WORKERS \
        --worker-class uvicorn.workers.UvicornWorker \
        --access-log \
        --log-level info \
        --timeout-keep-alive 65"]

# 開発環境用のオーバーライド用エントリーポイント
# docker-compose.ymlでCMDをオーバーライドして開発モードで実行可能