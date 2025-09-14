import pandas as pd
import yfinance
import json
import logging
import asyncpg
import os
import csv
import asyncio
import time
from fastapi import FastAPI, Query, HTTPException
from fastapi.staticfiles import StaticFiles
from typing import List, Dict, Any
from datetime import datetime, timedelta

# ==============================================================================
# 設定 (Configuration)
# ==============================================================================
logging.basicConfig(level=logging.INFO)
app = FastAPI()

# --- 短期設定のパラメータ ---
PERIOD = "1y"
RS_RATIO_WINDOW = 60
RS_MOMENTUM_CHANGE_PERIOD = 5
RS_MOMENTUM_ROLLING_WINDOW = 10
DEFAULT_TAIL_LENGTH = 5
HISTORICAL_DAYS = 60  # 過去何日分のデータを返すか

# --- 銘柄リスト ---
BENCHMARK_TICKERS = {"1306.T": "TOPIX ETF", "1321.T": "日経225 ETF"}
SECTOR_ETFS = {
    "1617.T": "食品", "1618.T": "エネ資源", "1619.T": "建設資材",
    "1620.T": "素材化学", "1621.T": "医薬品", "1622.T": "自動車",
    "1623.T": "鉄非鉄", "1624.T": "機械", "1625.T": "電機精密",
    "1626.T": "情通サービス", "1627.T": "電力ガス", "1628.T": "運輸物流",
    "1629.T": "商社卸売", "1630.T": "小売", "1631.T": "銀行",
    "1632.T": "金融(銀除)", "1633.T": "不動産"
}
SECTOR_TICKERS = list(SECTOR_ETFS.keys())

# ==============================================================================
# ヘルパー関数 (Helper Functions)
# ==============================================================================
def get_quadrant(rs_ratio, rs_momentum):
    """RRGの象限を判定する"""
    if rs_ratio >= 100 and rs_momentum >= 100:
        return "Leading"
    if rs_ratio < 100 and rs_momentum >= 100:
        return "Improving"
    if rs_ratio < 100 and rs_momentum < 100:
        return "Lagging"
    if rs_ratio >= 100 and rs_momentum < 100:
        return "Weakening"
    return "N/A"

# ==============================================================================
# APIエンドポイント (API Endpoints)
# ==============================================================================

@app.get("/api/health")
async def health_check():
    """ヘルスチェックエンドポイント"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "working"
    }

@app.get("/api/status")
async def api_status():
    """API状態確認エンドポイント"""
    return {"message": "Sector Rotation Dashboard API", "status": "running", "version": "working"}

@app.get("/calculate")
def calculate_dashboard_data(
    benchmark_ticker: str = Query(..., description="例: 1306.T or 1321.T"),
    date: str = Query(..., description="基準日 (YYYY-MM-DD), 例: 2025-08-31")
):
    try:
        target_date = datetime.strptime(date, '%Y-%m-%d').date()
    except ValueError:
        raise HTTPException(status_code=400, detail="日付のフォーマットは YYYY-MM-DD にしてください")

    # --- 1. データ取得（修正版）---
    all_tickers_to_fetch = SECTOR_TICKERS + list(BENCHMARK_TICKERS.keys())
    
    try:
        logging.info("yfinanceでデータを取得中...")
        # endパラメータを使用せず、periodのみでデータ取得
        raw_data = yfinance.download(
            all_tickers_to_fetch,
            period=PERIOD,  # "1y"
            progress=False
        )
        logging.info(f"データ取得完了: {len(raw_data)} 日分")
        
    except Exception as e:
        logging.error(f"yfinanceでのデータ取得エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"データ取得エラー: {str(e)}")
    
    if raw_data.empty:
        raise HTTPException(status_code=404, detail="株価データを取得できませんでした。")

    # データの利用可能範囲をチェック
    available_dates = raw_data.index.date
    latest_available = max(available_dates)
    earliest_available = min(available_dates)
    logging.info(f"取得データの期間: {earliest_available} 〜 {latest_available}")
    
    # 指定された基準日が利用可能なデータの範囲外の場合は調整
    if target_date > latest_available:
        logging.warning(f"指定日 {target_date} は未取得。最新の {latest_available} を使用します。")
        target_date = latest_available
    elif target_date < earliest_available:
        logging.warning(f"指定日 {target_date} は古すぎます。最古の {earliest_available} を使用します。")
        target_date = earliest_available

    # --- 2. ベンチマークのOHLCデータ整形 ---
    benchmark_ohlc_raw = raw_data.loc[:, (slice(None), benchmark_ticker)]
    benchmark_ohlc_raw.columns = benchmark_ohlc_raw.columns.droplevel(1)
    benchmark_ohlc = benchmark_ohlc_raw[['Open', 'High', 'Low', 'Close']].reset_index()
    benchmark_ohlc.columns = ['date_dt', 'open', 'high', 'low', 'close']
    benchmark_ohlc['date'] = benchmark_ohlc['date_dt'].dt.strftime('%Y-%m-%d')
    benchmark_ohlc_list = benchmark_ohlc.drop(columns=['date_dt']).to_dict('records')

    # --- 3. 全期間のRRG計算 ---
    close_data = raw_data['Close'].dropna(how='all')
    close_data_until_target = close_data[close_data.index.date <= target_date]
    
    rs = close_data_until_target[SECTOR_TICKERS].div(close_data_until_target[benchmark_ticker], axis=0)
    rs_ratio = 100 + ((rs / rs.rolling(window=RS_RATIO_WINDOW).mean()) - 1) * 100
    rs_momentum = 100 + rs.pct_change(periods=RS_MOMENTUM_CHANGE_PERIOD).rolling(window=RS_MOMENTUM_ROLLING_WINDOW).mean() * 100
    
    if rs_ratio.empty or rs_momentum.empty:
        raise HTTPException(status_code=404, detail="RRGデータを計算できませんでした。")

    # --- 4. 過去N日分の日別RRGデータを構築 ---
    # 利用可能な日付の範囲を決定
    available_dates = rs_ratio.dropna().index
    if len(available_dates) == 0:
        raise HTTPException(status_code=404, detail="有効なRRGデータが見つかりませんでした。")

    # 過去HISTORICAL_DAYS日分、または利用可能なデータの範囲内
    end_idx = len(available_dates) - 1
    start_idx = max(0, end_idx - HISTORICAL_DAYS + 1)
    date_range = available_dates[start_idx:end_idx + 1]

    # 各日付のデータを格納
    historical_data = {}
    
    for date_idx, date in enumerate(date_range):
        date_str = date.strftime('%Y-%m-%d')
        historical_data[date_str] = {
            'sectors': [],
            'available_dates': [d.strftime('%Y-%m-%d') for d in date_range[:date_idx + 1]]
        }

        for ticker in SECTOR_TICKERS:
            ratio_val = rs_ratio[ticker].get(date)
            momentum_val = rs_momentum[ticker].get(date)

            if pd.isna(ratio_val) or pd.isna(momentum_val):
                continue

            # 該当日までの軌跡データを計算（最大20日分）
            max_tail_length = 20
            available_dates_up_to_current = date_range[:date_idx + 1]
            tail_start_idx = max(0, len(available_dates_up_to_current) - max_tail_length)
            tail_dates = available_dates_up_to_current[tail_start_idx:]

            tail_data = []
            for tail_date in tail_dates:
                tail_ratio = rs_ratio[ticker].get(tail_date)
                tail_momentum = rs_momentum[ticker].get(tail_date)
                if not (pd.isna(tail_ratio) or pd.isna(tail_momentum)):
                    tail_data.append([tail_ratio, tail_momentum])

            # 価格データ（当該日付）
            latest_price_data = close_data_until_target[ticker].loc[:date]
            if len(latest_price_data) >= 2:
                price = latest_price_data.iloc[-1]
                change_pct = (latest_price_data.pct_change().iloc[-1] * 100)
            else:
                price = latest_price_data.iloc[-1] if len(latest_price_data) > 0 else 0
                change_pct = 0

            # 週次変化率
            weekly_change = 0
            if len(latest_price_data) > 5:
                weekly_change = latest_price_data.pct_change(5).iloc[-1] * 100

            historical_data[date_str]['sectors'].append({
                "name": SECTOR_ETFS.get(ticker, ticker),
                "ticker": ticker,
                "price": price,
                "change_pct": change_pct,
                "rs_ratio": ratio_val,
                "rs_momentum": momentum_val,
                "quadrant": get_quadrant(ratio_val, momentum_val),
                "weekly_change_pct": weekly_change,
                "tail": tail_data
            })

    # --- 5. 最終的なJSONレスポンスを作成 ---
    return {
        "benchmark_ohlc": benchmark_ohlc_list,
        "historical_data": historical_data,
        "date_range": [d.strftime('%Y-%m-%d') for d in date_range],
        "target_date": target_date.strftime('%Y-%m-%d'),
        "latest_available_date": latest_available.strftime('%Y-%m-%d')
    }

@app.get("/api/test")
async def simple_test():
    """シンプルなテストエンドポイント"""
    return {"message": "Test endpoint working", "timestamp": datetime.now().isoformat()}

@app.get("/api/csv-check")
async def check_csv_file():
    """CSVファイルの存在確認"""
    csv_path = "/app/tickers_memo.csv"
    
    if os.path.exists(csv_path):
        file_size = os.path.getsize(csv_path)
        
        try:
            with open(csv_path, 'r', encoding='utf-8') as f:
                lines = []
                for i, line in enumerate(f):
                    if i < 5:
                        lines.append(line.strip())
                    else:
                        break
            
            return {
                "csv_exists": True,
                "file_size": file_size,
                "first_5_lines": lines,
                "path": csv_path
            }
        except Exception as e:
            return {
                "csv_exists": True,
                "file_size": file_size,
                "error": f"Failed to read file: {str(e)}",
                "path": csv_path
            }
    else:
        return {
            "csv_exists": False,
            "path": csv_path,
            "current_directory": os.getcwd(),
            "files_in_app": os.listdir("/app") if os.path.exists("/app") else []
        }

@app.get("/api/db-data-check")
async def check_database_data():
    """データベース内のデータ存在確認"""
    try:
        # データベース接続設定
        db_host = os.getenv('DB_HOST', 'postgres')
        db_name = os.getenv('DB_NAME', 'sector_rotation')
        db_user = os.getenv('DB_USER', 'admin')
        db_password = os.getenv('DB_PASSWORD', 'secure_password_123')
        db_port = int(os.getenv('DB_PORT', 5432))
        
        # 接続
        conn = await asyncpg.connect(
            host=db_host,
            port=db_port,
            user=db_user,
            password=db_password,
            database=db_name
        )
        
        # 各テーブルのデータ数確認
        table_stats = {}
        
        # 1. benchmarks テーブル
        count = await conn.fetchval("SELECT COUNT(*) FROM benchmarks")
        sample = await conn.fetch("SELECT * FROM benchmarks LIMIT 3")
        table_stats['benchmarks'] = {
            'count': count,
            'sample': [dict(row) for row in sample]
        }
        
        # 2. sector_etfs テーブル
        count = await conn.fetchval("SELECT COUNT(*) FROM sector_etfs")
        sample = await conn.fetch("SELECT * FROM sector_etfs LIMIT 5")
        table_stats['sector_etfs'] = {
            'count': count,
            'sample': [dict(row) for row in sample]
        }
        
        # 3. daily_prices テーブル
        count = await conn.fetchval("SELECT COUNT(*) FROM daily_prices")
        latest = await conn.fetch("""
            SELECT ticker, date, close_price 
            FROM daily_prices 
            ORDER BY date DESC, ticker 
            LIMIT 5
        """)
        # ティッカー別統計
        ticker_stats = await conn.fetch("""
            SELECT ticker, 
                   COUNT(*) as record_count,
                   MIN(date) as earliest_date,
                   MAX(date) as latest_date
            FROM daily_prices 
            GROUP BY ticker 
            ORDER BY record_count DESC
            LIMIT 10
        """)
        table_stats['daily_prices'] = {
            'total_count': count,
            'latest_records': [dict(row) for row in latest],
            'ticker_statistics': [dict(row) for row in ticker_stats]
        }
        
        # 4. rrg_calculations テーブル
        count = await conn.fetchval("SELECT COUNT(*) FROM rrg_calculations")
        latest_rrg = await conn.fetch("""
            SELECT benchmark_ticker, sector_ticker, calculation_date, 
                   rs_ratio, rs_momentum, quadrant
            FROM rrg_calculations 
            ORDER BY calculation_date DESC 
            LIMIT 5
        """)
        # 計算結果統計
        calc_stats = await conn.fetch("""
            SELECT benchmark_ticker,
                   COUNT(*) as calculation_count,
                   COUNT(DISTINCT sector_ticker) as sectors_count,
                   MAX(calculation_date) as latest_date
            FROM rrg_calculations 
            GROUP BY benchmark_ticker
        """)
        table_stats['rrg_calculations'] = {
            'total_count': count,
            'latest_calculations': [dict(row) for row in latest_rrg],
            'benchmark_statistics': [dict(row) for row in calc_stats]
        }
        
        # 5. data_update_logs テーブル
        count = await conn.fetchval("SELECT COUNT(*) FROM data_update_logs")
        recent_logs = await conn.fetch("""
            SELECT update_type, ticker, update_date, status, records_updated
            FROM data_update_logs 
            ORDER BY created_at DESC 
            LIMIT 5
        """)
        table_stats['data_update_logs'] = {
            'count': count,
            'recent_logs': [dict(row) for row in recent_logs]
        }
        
        await conn.close()
        
        return {
            "status": "success",
            "database_connected": True,
            "tables": table_stats,
            "summary": {
                "has_benchmarks": table_stats['benchmarks']['count'] > 0,
                "has_sector_etfs": table_stats['sector_etfs']['count'] > 0,
                "has_price_data": table_stats['daily_prices']['total_count'] > 0,
                "has_rrg_calculations": table_stats['rrg_calculations']['total_count'] > 0,
                "total_records": sum([
                    table_stats['benchmarks']['count'],
                    table_stats['sector_etfs']['count'],
                    table_stats['daily_prices']['total_count'],
                    table_stats['rrg_calculations']['total_count']
                ])
            },
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "database_connected": False,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

@app.post("/api/batch_store_stock")
async def batch_store_stock_data(
    benchmark_ticker: str = Query("1306.T", description="ベンチマークティッカー"),
    target_date: str = Query(datetime.now().strftime('%Y-%m-%d'), description="対象日"),
    store_days: int = Query(30, description="保存する日数（過去何日分）"),
    force_overwrite: bool = Query(False, description="既存データを上書きするか")
):
    """
    Yahoo Financeからデータを取得してデータベースに一括保存
    """
    
    try:
        # データベース接続設定
        db_host = os.getenv('DB_HOST', 'postgres')
        db_name = os.getenv('DB_NAME', 'sector_rotation')
        db_user = os.getenv('DB_USER', 'admin')
        db_password = os.getenv('DB_PASSWORD', 'secure_password_123')
        db_port = int(os.getenv('DB_PORT', 5432))
        
        target_date_obj = datetime.strptime(target_date, '%Y-%m-%d').date()
        
        # 1. Yahoo Financeからデータ取得
        all_tickers = SECTOR_TICKERS + list(BENCHMARK_TICKERS.keys())
        
        logging.info(f"バッチ保存開始: {len(all_tickers)}銘柄, 対象日: {target_date}")
        
        raw_data = yfinance.download(
            all_tickers,
            period=PERIOD,
            progress=False
        )
        
        if raw_data.empty:
            return {"error": "データ取得に失敗しました", "status": "failed"}
        
        # データベース接続
        conn = await asyncpg.connect(
            host=db_host,
            port=db_port,
            user=db_user,
            password=db_password,
            database=db_name
        )
        
        # 2. 価格データの保存
        close_data = raw_data['Close'].dropna(how='all')
        
        # 対象日以前のデータのみ
        filtered_data = raw_data[raw_data.index.date <= target_date_obj]
        
        # 最新のstore_days日分のデータを保存
        if len(filtered_data) > store_days:
            filtered_data = filtered_data.tail(store_days)
        
        saved_records = 0
        skipped_records = 0
        
        # 各銘柄の価格データを保存
        for ticker in all_tickers:
            if ticker not in close_data.columns:
                continue
                
            ticker_data = filtered_data.loc[:, (slice(None), ticker)]
            
            if ticker_data.empty:
                continue
            
            # マルチインデックスの処理
            if len(ticker_data.columns.levels) > 1:
                ticker_data.columns = ticker_data.columns.droplevel(1)
            
            for date_idx, row in ticker_data.iterrows():
                date_val = date_idx.date()
                
                # NaNチェック
                if pd.isna(row.get('Close')):
                    continue
                
                try:
                    if force_overwrite:
                        # UPSERT処理
                        await conn.execute("""
                            INSERT INTO daily_prices 
                            (ticker, date, open_price, high_price, low_price, close_price, volume)
                            VALUES ($1, $2, $3, $4, $5, $6, $7)
                            ON CONFLICT (ticker, date) 
                            DO UPDATE SET
                                open_price = EXCLUDED.open_price,
                                high_price = EXCLUDED.high_price,
                                low_price = EXCLUDED.low_price,
                                close_price = EXCLUDED.close_price,
                                volume = EXCLUDED.volume,
                                updated_at = CURRENT_TIMESTAMP
                        """, 
                        ticker, date_val,
                        float(row.get('Open', 0)) if not pd.isna(row.get('Open')) else None,
                        float(row.get('High', 0)) if not pd.isna(row.get('High')) else None,
                        float(row.get('Low', 0)) if not pd.isna(row.get('Low')) else None,
                        float(row['Close']),
                        int(row.get('Volume', 0)) if not pd.isna(row.get('Volume')) else None
                        )
                    else:
                        # 既存データがあるかチェック
                        existing = await conn.fetchval(
                            "SELECT COUNT(*) FROM daily_prices WHERE ticker = $1 AND date = $2",
                            ticker, date_val
                        )
                        
                        if existing == 0:
                            await conn.execute("""
                                INSERT INTO daily_prices 
                                (ticker, date, open_price, high_price, low_price, close_price, volume)
                                VALUES ($1, $2, $3, $4, $5, $6, $7)
                            """, 
                            ticker, date_val,
                            float(row.get('Open', 0)) if not pd.isna(row.get('Open')) else None,
                            float(row.get('High', 0)) if not pd.isna(row.get('High')) else None,
                            float(row.get('Low', 0)) if not pd.isna(row.get('Low')) else None,
                            float(row['Close']),
                            int(row.get('Volume', 0)) if not pd.isna(row.get('Volume')) else None
                            )
                        else:
                            skipped_records += 1
                            continue
                    
                    saved_records += 1
                    
                except Exception as e:
                    logging.error(f"価格データ保存エラー {ticker} {date_val}: {str(e)}")
                    continue
        
        # 3. RRG計算と保存
        rrg_saved = 0
        
        if saved_records > 0:
            # RRG計算
            close_data_until_target = close_data[close_data.index.date <= target_date_obj]
            
            if not close_data_until_target.empty and len(close_data_until_target) >= RS_RATIO_WINDOW:
                rs = close_data_until_target[SECTOR_TICKERS].div(
                    close_data_until_target[benchmark_ticker], axis=0
                )
                rs_ratio = 100 + ((rs / rs.rolling(window=RS_RATIO_WINDOW).mean()) - 1) * 100
                rs_momentum = 100 + rs.pct_change(periods=RS_MOMENTUM_CHANGE_PERIOD).rolling(
                    window=RS_MOMENTUM_ROLLING_WINDOW
                ).mean() * 100
                
                # 最新の計算結果を保存
                latest_date = rs_ratio.dropna().index[-1].date()
                
                for ticker in SECTOR_TICKERS:
                    ratio_val = rs_ratio[ticker].iloc[-1] if not rs_ratio[ticker].empty else None
                    momentum_val = rs_momentum[ticker].iloc[-1] if not rs_momentum[ticker].empty else None
                    
                    if pd.isna(ratio_val) or pd.isna(momentum_val):
                        continue
                    
                    # 価格情報取得
                    price = close_data_until_target[ticker].iloc[-1]
                    change_pct = close_data_until_target[ticker].pct_change().iloc[-1] * 100
                    
                    try:
                        if force_overwrite:
                            await conn.execute("""
                                INSERT INTO rrg_calculations 
                                (benchmark_ticker, sector_ticker, calculation_date, rs_ratio, rs_momentum, 
                                 quadrant, price, change_pct, weekly_change_pct)
                                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                                ON CONFLICT (benchmark_ticker, sector_ticker, calculation_date)
                                DO UPDATE SET
                                    rs_ratio = EXCLUDED.rs_ratio,
                                    rs_momentum = EXCLUDED.rs_momentum,
                                    quadrant = EXCLUDED.quadrant,
                                    price = EXCLUDED.price,
                                    change_pct = EXCLUDED.change_pct,
                                    updated_at = CURRENT_TIMESTAMP
                            """,
                            benchmark_ticker, ticker, latest_date,
                            float(ratio_val), float(momentum_val),
                            get_quadrant(ratio_val, momentum_val),
                            float(price), float(change_pct), 0
                            )
                        else:
                            existing_rrg = await conn.fetchval(
                                "SELECT COUNT(*) FROM rrg_calculations WHERE benchmark_ticker = $1 AND sector_ticker = $2 AND calculation_date = $3",
                                benchmark_ticker, ticker, latest_date
                            )
                            
                            if existing_rrg == 0:
                                await conn.execute("""
                                    INSERT INTO rrg_calculations 
                                    (benchmark_ticker, sector_ticker, calculation_date, rs_ratio, rs_momentum, 
                                     quadrant, price, change_pct, weekly_change_pct)
                                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                                """,
                                benchmark_ticker, ticker, latest_date,
                                float(ratio_val), float(momentum_val),
                                get_quadrant(ratio_val, momentum_val),
                                float(price), float(change_pct), 0
                                )
                        
                        rrg_saved += 1
                        
                    except Exception as e:
                        logging.error(f"RRG保存エラー {ticker}: {str(e)}")
                        continue
        
        # 4. ログ記録
        await conn.execute("""
            INSERT INTO data_update_logs 
            (update_type, update_date, records_updated, status)
            VALUES ($1, $2, $3, $4)
        """, 'batch_store', target_date_obj, saved_records, 'success')
        
        await conn.close()
        
        return {
            "status": "success",
            "message": "バッチ保存完了",
            "benchmark_ticker": benchmark_ticker,
            "target_date": target_date,
            "saved_price_records": saved_records,
            "skipped_price_records": skipped_records,
            "saved_rrg_records": rrg_saved,
            "total_tickers": len(all_tickers),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logging.error(f"バッチ保存エラー: {str(e)}")
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

@app.post("/api/batch_store_constituents")
async def batch_store_constituents_data(
    target_date: str = Query(datetime.now().strftime('%Y-%m-%d'), description="対象日"),
    store_days: int = Query(30, description="保存する日数"),
    batch_size: int = Query(50, description="一度に処理する銘柄数（APIレート制限対策）"),
    delay_seconds: int = Query(2, description="バッチ間の待機時間（秒）"),
    force_overwrite: bool = Query(False, description="既存データを上書きするか"),
    test_mode: bool = Query(False, description="テストモード（最初の10銘柄のみ）")
):
    """
    tickers_memo.csvから構成銘柄を読み取り、Yahoo Financeからデータを取得してデータベースに保存
    400銘柄を安全に処理するため、バッチ処理とレート制限を実装
    """
    
    try:
        # データベース接続設定
        db_host = os.getenv('DB_HOST', 'postgres')
        db_name = os.getenv('DB_NAME', 'sector_rotation')
        db_user = os.getenv('DB_USER', 'admin')
        db_password = os.getenv('DB_PASSWORD', 'secure_password_123')
        db_port = int(os.getenv('DB_PORT', 5432))
        
        target_date_obj = datetime.strptime(target_date, '%Y-%m-%d').date()
        
        # 1. CSVファイルから構成銘柄を読み込み
        csv_path = "/app/tickers_memo.csv"
        if not os.path.exists(csv_path):
            return {"error": "tickers_memo.csv not found", "status": "failed"}
        
        constituents = []
        with open(csv_path, 'r', encoding='utf-8') as file:
            reader = csv.DictReader(file)
            for row in reader:
                ticker = row['ticker'].strip()
                # .Tサフィックスを追加（必要に応じて）
                if not ticker.endswith('.T'):
                    ticker += '.T'
                
                constituents.append({
                    'ticker': ticker,
                    'name': row['銘柄'].strip(),
                    'etf': row['etf-ticker'].strip()
                })
        
        # テストモード
        if test_mode:
            constituents = constituents[:10]
            logging.info(f"テストモード: {len(constituents)}銘柄のみ処理")
        
        unique_tickers = list(set([c['ticker'] for c in constituents]))
        logging.info(f"構成銘柄バッチ保存開始: {len(unique_tickers)}銘柄")
        
        # データベース接続
        conn = await asyncpg.connect(
            host=db_host,
            port=db_port,
            user=db_user,
            password=db_password,
            database=db_name
        )
        
        # 2. 銘柄をバッチに分割して処理
        total_saved = 0
        total_skipped = 0
        total_errors = 0
        processed_batches = 0
        
        # バッチ処理
        for i in range(0, len(unique_tickers), batch_size):
            batch_tickers = unique_tickers[i:i + batch_size]
            batch_num = i // batch_size + 1
            total_batches = (len(unique_tickers) + batch_size - 1) // batch_size
            
            logging.info(f"バッチ {batch_num}/{total_batches} 処理中: {len(batch_tickers)}銘柄")
            
            try:
                # Yahoo Financeからデータ取得
                logging.info(f"Yahoo Financeからデータ取得: {batch_tickers[:3]}...")
                
                raw_data = yfinance.download(
                    batch_tickers,
                    period=f"{store_days + 5}d",  # 少し余裕を持たせる
                    progress=False,
                    threads=True  # 並列取得
                )
                
                if raw_data.empty:
                    logging.warning(f"バッチ {batch_num}: データが空です")
                    continue
                
                # 3. 各銘柄のデータを保存
                for ticker in batch_tickers:
                    try:
                        # データが単一銘柄か複数銘柄かで処理を分ける
                        if len(batch_tickers) == 1:
                            ticker_data = raw_data
                        else:
                            if 'Close' in raw_data.columns:
                                ticker_data = raw_data.loc[:, (slice(None), ticker)]
                                if not ticker_data.empty and len(ticker_data.columns.levels) > 1:
                                    ticker_data.columns = ticker_data.columns.droplevel(1)
                            else:
                                continue
                        
                        if ticker_data.empty:
                            logging.warning(f"データなし: {ticker}")
                            continue
                        
                        # 対象日以前のデータのみ
                        filtered_data = ticker_data[ticker_data.index.date <= target_date_obj]
                        
                        if filtered_data.empty:
                            continue
                        
                        # 最新のstore_days日分
                        if len(filtered_data) > store_days:
                            filtered_data = filtered_data.tail(store_days)
                        
                        # 各日のデータを保存
                        for date_idx, row in filtered_data.iterrows():
                            date_val = date_idx.date()
                            
                            # 終値が必須
                            if pd.isna(row.get('Close')):
                                continue
                            
                            try:
                                if force_overwrite:
                                    await conn.execute("""
                                        INSERT INTO daily_prices 
                                        (ticker, date, open_price, high_price, low_price, close_price, volume)
                                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                                        ON CONFLICT (ticker, date) 
                                        DO UPDATE SET
                                            open_price = EXCLUDED.open_price,
                                            high_price = EXCLUDED.high_price,
                                            low_price = EXCLUDED.low_price,
                                            close_price = EXCLUDED.close_price,
                                            volume = EXCLUDED.volume,
                                            updated_at = CURRENT_TIMESTAMP
                                    """, 
                                    ticker, date_val,
                                    float(row.get('Open', 0)) if not pd.isna(row.get('Open')) else None,
                                    float(row.get('High', 0)) if not pd.isna(row.get('High')) else None,
                                    float(row.get('Low', 0)) if not pd.isna(row.get('Low')) else None,
                                    float(row['Close']),
                                    int(row.get('Volume', 0)) if not pd.isna(row.get('Volume')) else None
                                    )
                                else:
                                    # 既存データチェック
                                    existing = await conn.fetchval(
                                        "SELECT COUNT(*) FROM daily_prices WHERE ticker = $1 AND date = $2",
                                        ticker, date_val
                                    )
                                    
                                    if existing == 0:
                                        await conn.execute("""
                                            INSERT INTO daily_prices 
                                            (ticker, date, open_price, high_price, low_price, close_price, volume)
                                            VALUES ($1, $2, $3, $4, $5, $6, $7)
                                        """, 
                                        ticker, date_val,
                                        float(row.get('Open', 0)) if not pd.isna(row.get('Open')) else None,
                                        float(row.get('High', 0)) if not pd.isna(row.get('High')) else None,
                                        float(row.get('Low', 0)) if not pd.isna(row.get('Low')) else None,
                                        float(row['Close']),
                                        int(row.get('Volume', 0)) if not pd.isna(row.get('Volume')) else None
                                        )
                                    else:
                                        total_skipped += 1
                                        continue
                                
                                total_saved += 1
                                
                            except Exception as e:
                                logging.error(f"保存エラー {ticker} {date_val}: {str(e)}")
                                total_errors += 1
                                continue
                    
                    except Exception as e:
                        logging.error(f"銘柄処理エラー {ticker}: {str(e)}")
                        total_errors += 1
                        continue
                
                processed_batches += 1
                
                # バッチ間の待機（APIレート制限対策）
                if i + batch_size < len(unique_tickers):
                    logging.info(f"バッチ {batch_num} 完了. {delay_seconds}秒待機中...")
                    await asyncio.sleep(delay_seconds)
                
            except Exception as e:
                logging.error(f"バッチ {batch_num} 処理エラー: {str(e)}")
                total_errors += 1
                continue
        
        # 4. 構成銘柄テーブルの更新（CSVデータをDBに保存）
        constituents_saved = 0
        for constituent in constituents:
            try:
                await conn.execute("""
                    INSERT INTO constituents (etf_ticker, constituent_ticker, company_name)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (etf_ticker, constituent_ticker) DO NOTHING
                """, 
                constituent['etf'], constituent['ticker'], constituent['name']
                )
                constituents_saved += 1
            except Exception as e:
                logging.error(f"構成銘柄保存エラー: {str(e)}")
                continue
        
        # 5. ログ記録
        await conn.execute("""
            INSERT INTO data_update_logs 
            (update_type, update_date, records_updated, status)
            VALUES ($1, $2, $3, $4)
        """, 'batch_constituents', target_date_obj, total_saved, 'success')
        
        await conn.close()
        
        return {
            "status": "success",
            "message": "構成銘柄バッチ保存完了",
            "target_date": target_date,
            "total_tickers": len(unique_tickers),
            "processed_batches": processed_batches,
            "batch_size": batch_size,
            "saved_price_records": total_saved,
            "skipped_records": total_skipped,
            "error_count": total_errors,
            "constituents_saved": constituents_saved,
            "test_mode": test_mode,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logging.error(f"構成銘柄バッチ保存エラー: {str(e)}")
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

@app.get("/api/sector-constituents/{sector_ticker}")
async def get_sector_constituents(sector_ticker: str):
    # CSVまたはDBから構成銘柄を取得して返す
    pass

@app.get("/api/constituents_status")
async def check_constituents_status():
    """構成銘柄のデータ保存状況確認"""
    try:
        db_host = os.getenv('DB_HOST', 'postgres')
        db_name = os.getenv('DB_NAME', 'sector_rotation')
        db_user = os.getenv('DB_USER', 'admin')
        db_password = os.getenv('DB_PASSWORD', 'secure_password_123')
        db_port = int(os.getenv('DB_PORT', 5432))
        
        conn = await asyncpg.connect(
            host=db_host,
            port=db_port,
            user=db_user,
            password=db_password,
            database=db_name
        )
        
        # 構成銘柄のデータ保存状況
        stats = await conn.fetch("""
            SELECT 
                CASE 
                    WHEN ticker LIKE '%.T' THEN 'constituent'
                    ELSE 'other'
                END as ticker_type,
                COUNT(DISTINCT ticker) as unique_tickers,
                COUNT(*) as total_records,
                MAX(date) as latest_date,
                MIN(date) as earliest_date
            FROM daily_prices 
            GROUP BY ticker_type
        """)
        
        # セクター別構成銘柄数
        sector_stats = await conn.fetch("""
            SELECT etf_ticker, COUNT(*) as constituent_count
            FROM constituents 
            GROUP BY etf_ticker 
            ORDER BY constituent_count DESC
        """)
        
        await conn.close()
        
        return {
            "status": "success",
            "storage_statistics": [dict(row) for row in stats],
            "sector_constituents": [dict(row) for row in sector_stats],
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

# ==============================================================================
# 静的ファイル配信（最優先）
# ==============================================================================
# APIルートより前に静的ファイルをマウントして、index.htmlが優先されるようにする
app.mount("/", StaticFiles(directory="static", html=True), name="static")