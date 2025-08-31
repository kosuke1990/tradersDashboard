import pandas as pd
import yfinance
import json
import logging
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
@app.get("/calculate")
def calculate_dashboard_data(
    benchmark_ticker: str = Query(..., description="例: 1306.T or 1321.T"),
    date: str = Query(..., description="基準日 (YYYY-MM-DD), 例: 2025-08-31")
):
    try:
        target_date = datetime.strptime(date, '%Y-%m-%d').date()
    except ValueError:
        raise HTTPException(status_code=400, detail="日付のフォーマットは YYYY-MM-DD にしてください")

    # --- 1. データ取得 ---
    all_tickers_to_fetch = SECTOR_TICKERS + list(BENCHMARK_TICKERS.keys())
    end_date_for_fetch = min(target_date + timedelta(days=1), datetime.now().date())
    
    raw_data = yfinance.download(
        all_tickers_to_fetch,
        period=PERIOD,
        end=end_date_for_fetch,
        progress=False
    )
    if raw_data.empty:
        raise HTTPException(status_code=404, detail="指定された期間の株価データを取得できませんでした。")

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
        "target_date": target_date.strftime('%Y-%m-%d')
    }

# 静的ファイル配信機能
app.mount("/", StaticFiles(directory="static", html=True), name="static")