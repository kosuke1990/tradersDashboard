import pandas as pd
import yfinance as yf
import json
import logging
from fastapi import FastAPI, Query
from typing import List, Dict, Any

# ==============================================================================
# 設定 (Configuration)
# ==============================================================================
logging.basicConfig(level=logging.INFO)
app = FastAPI()

# --- 定数 (Constants) ---
PERIOD = "2y"
RS_RATIO_WINDOW = 52
RS_MOMENTUM_CHANGE_PERIOD = 4
RS_MOMENTUM_ROLLING_WINDOW = 13
TICKERS_FILEPATH = 'tickers.json'

# ==============================================================================
# ヘルパー関数 (Helper Functions)
# ==============================================================================
def load_tickers(filepath: str) -> List[Dict[str, str]]:
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        logging.error(f"{filepath} not found.")
        return []

def fetch_stock_data(symbols: List[str], period: str) -> pd.DataFrame:
    logging.info(f"Fetching data for {len(symbols)} symbols...")
    raw_data = yf.download(symbols, period=period, progress=False)
    
    if raw_data.empty or 'Close' not in raw_data.columns:
        logging.warning("Could not download valid 'Close' data.")
        return pd.DataFrame()
        
    logging.info("Data fetching complete.")
    return raw_data['Close'].dropna(how='all')

def calculate_rrg_metrics(data: pd.DataFrame, benchmark_ticker: str) -> pd.DataFrame:
    rs = data.drop(columns=benchmark_ticker, errors='ignore').div(data[benchmark_ticker], axis=0)
    
    rs_ratio = 100 + ((rs / rs.rolling(window=RS_RATIO_WINDOW).mean()) - 1) * 100
    rs_momentum = 100 + rs.pct_change(periods=RS_MOMENTUM_CHANGE_PERIOD).rolling(window=RS_MOMENTUM_ROLLING_WINDOW).mean() * 100
    
    return pd.concat([rs_ratio, rs_momentum], axis=1, keys=['ratio', 'momentum'])

# ★★★ この関数をシンプルで堅牢なロジックに置き換えました ★★★
def format_data_for_frontend(rrg_df: pd.DataFrame, symbols_to_plot: List[Dict]) -> List[Dict]:
    """
    計算されたRRGデータフレームをフロントエンドが要求するJSON形式に整形する。
    """
    results_by_date = []
    
    # 計算結果の日付リストをループ
    for date_ts in rrg_df.index:
        date_str = date_ts.strftime('%Y-%m-%d')
        points_on_date = []
        
        # プロット対象の銘柄をループ
        for item in symbols_to_plot:
            symbol = item['ticker']
            
            # MultiIndexのキーをタプルで指定
            ratio_key = ('ratio', symbol)
            momentum_key = ('momentum', symbol)
            
            # 計算結果のDataFrameにその銘柄のデータが存在するか確認
            if ratio_key in rrg_df.columns and momentum_key in rrg_df.columns:
                ratio_val = rrg_df.loc[date_ts, ratio_key]
                momentum_val = rrg_df.loc[date_ts, momentum_key]
                
                # 計算結果がNaN（Not a Number）でないことを確認
                if not pd.isna(ratio_val) and not pd.isna(momentum_val):
                    points_on_date.append({
                        'name': item['name'],
                        'symbol': symbol,
                        'rs_ratio': ratio_val,
                        'rs_momentum': momentum_val,
                    })

        # その日に有効なデータが1つでもあれば、最終結果に追加
        if points_on_date:
            results_by_date.append({
                'date': date_str,
                'points': points_on_date
            })
            
    return results_by_date

# ==============================================================================
# APIエンドポイント (API Endpoints)
# ==============================================================================
TICKERS_MASTER = load_tickers(TICKERS_FILEPATH)

@app.get("/tickers", response_model=List[Dict[str, str]])
def get_tickers():
    return TICKERS_MASTER

@app.get("/calculate", response_model=List[Dict[str, Any]])
def calculate_rrg_endpoint(benchmark_ticker: str):
    if not TICKERS_MASTER:
        return []

    symbols_to_plot = [t for t in TICKERS_MASTER if t['ticker'] != benchmark_ticker]
    plot_tickers = [t['ticker'] for t in symbols_to_plot]
    all_symbols_to_fetch = plot_tickers + [benchmark_ticker]

    price_data = fetch_stock_data(all_symbols_to_fetch, PERIOD)
    if price_data.empty:
        return []

    rrg_df = calculate_rrg_metrics(price_data, benchmark_ticker)
    if rrg_df.empty:
        logging.warning("RRG calculation resulted in an empty DataFrame.")
        return []

    return format_data_for_frontend(rrg_df, symbols_to_plot)

