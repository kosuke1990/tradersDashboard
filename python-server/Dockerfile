FROM python:3.9-slim

WORKDIR /app

# 先にrequirements.txtをコピーしてライブラリをインストール
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ソースコードをすべてコピー
COPY . .

# docker-compose.ymlで指定した8001番ポートを公開
EXPOSE 8001

# FastAPIサーバーをUvicornで起動する
CMD ["uvicorn", "processing:app", "--host", "0.0.0.0", "--port", "8001"]