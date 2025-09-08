import pandas as pd
import yfinance
import json
import logging
import csv
import io
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

# --- CSVファイルから構成銘柄マップを生成 ---
def load_constituents_from_csv_file(csv_file_path="tickers_memo.csv"):
    """CSVファイルから構成銘柄マップを生成"""
    import os
    
    constituents_map = {}
    
    try:
        # CSVファイルの存在確認
        if not os.path.exists(csv_file_path):
            logging.warning(f"CSVファイル {csv_file_path} が見つかりません。代替データを使用します。")
            return load_constituents_from_fallback_data()
        
        # CSVファイルを読み込み
        with open(csv_file_path, 'r', encoding='utf-8') as file:
            csv_reader = csv.DictReader(file)
            
            for row in csv_reader:
                etf_ticker = row['etf-ticker'].strip() if 'etf-ticker' in row else ''
                ticker = row['ticker'].strip() if 'ticker' in row else ''
                name = row['銘柄'].strip() if '銘柄' in row else ''
                
                # ティッカーが空の場合はスキップ
                if not ticker or not name or not etf_ticker:
                    continue
                    
                # ETFティッカーがキーとして存在しない場合は初期化
                if etf_ticker not in constituents_map:
                    constituents_map[etf_ticker] = []
                
                # 構成銘柄を追加
                constituents_map[etf_ticker].append({
                    "ticker": ticker,
                    "name": name
                })
        
        # 各セクターの銘柄数をログ出力
        for etf_ticker, constituents in constituents_map.items():
            sector_name = SECTOR_ETFS.get(etf_ticker, etf_ticker)
            logging.info(f"{sector_name} ({etf_ticker}): {len(constituents)}銘柄")
        
        logging.info(f"CSVファイル {csv_file_path} から構成銘柄データを読み込み完了")
        return constituents_map
        
    except Exception as e:
        logging.error(f"CSVファイル読み込みエラー: {str(e)}")
        logging.info("代替データを使用します。")
        return load_constituents_from_fallback_data()

def load_constituents_from_fallback_data():
    """フォールバック用の構成銘柄データ（CSVファイルが読み込めない場合）"""
    csv_data = """etf-ticker,ticker,銘柄
1617.T,2502,アサヒグループホールディングス
1617.T,2914,日本たばこ産業
1617.T,2503,キリンホールディングス
1617.T,2802,味の素
1617.T,2269,明治ホールディングス
1617.T,2587,サントリー食品インターナショナル
1617.T,2897,日清食品ホールディングス
1617.T,2264,森永乳業
1617.T,2875,東洋水産
1617.T,2501,サッポロホールディングス
1618.T,5020,ENEOSホールディングス
1618.T,1605,INPEX
1618.T,5019,出光興産
1618.T,5021,コスモエネルギーホールディングス
1618.T,1662,石油資源開発
1618.T,1513,日鉄鉱業
1618.T,4080,ニチレキグループ
1618.T,1664,K&Oエナジーグループ
1618.T,1648,住石ホールディングス
1618.T,5013,ユシロ化学工業
1618.T,3309,日本コークス工業
1618.T,5017,富士石油
1619.T,1925,大和ハウス工業
1619.T,1928,積水ハウス
1619.T,1801,大成建設
1619.T,1802,大林組
1619.T,1803,清水建設
1619.T,1812,鹿島建設
1619.T,5233,太平洋セメント
1619.T,5201,AGC
1619.T,5703,日本軽金属ホールディングス
1619.T,7936,アシックス
1620.T,4063,信越化学工業
1620.T,4188,三菱ケミカルグループ
1620.T,4005,住友化学
1620.T,3407,旭化成
1620.T,3402,東レ
1620.T,4901,富士フイルムホールディングス
1620.T,4202,ダイセル
1620.T,4911,資生堂
1620.T,4452,花王
1620.T,4183,三井化学
1621.T,4568,第一三共
1621.T,4502,武田薬品工業
1621.T,4519,中外製薬
1621.T,4503,アステラス製薬
1621.T,4507,塩野義製薬
1621.T,4578,大塚ホールディングス
1621.T,4528,小野薬品工業
1621.T,4565,そーせいグループ
1621.T,4543,テルモ
1621.T,4587,ペプチドリーム
1622.T,7203,トヨタ自動車
1622.T,7267,本田技研工業
1622.T,6902,デンソー
1622.T,7201,日産自動車
1622.T,7269,スズキ
1622.T,6503,三菱電機
1622.T,7272,ヤマハ発動機
1622.T,6981,村田製作所
1622.T,7270,SUBARU
1622.T,6920,レーザーテック
1623.T,5401,日本製鉄
1623.T,5713,住友金属鉱業
1623.T,5802,住友電気工業
1623.T,5411,JFEホールディングス
1623.T,5714,DOWAホールディングス
1623.T,5706,三井金属鉱業
1623.T,5406,神戸製鋼所
1623.T,5801,古河電気工業
1623.T,5711,三菱マテリアル
1623.T,5703,日本軽金属ホールディングス
1624.T,6861,キーエンス
1624.T,6301,小松製作所
1624.T,6954,ファナック
1624.T,6367,ダイキン工業
1624.T,7751,キヤノン
1624.T,6326,クボタ
1624.T,6506,安川電機
1624.T,6146,ディスコ
1624.T,6273,SMC
1624.T,7741,HOYA
1625.T,6758,ソニーグループ
1625.T,8035,東京エレクトロン
1625.T,6501,日立製作所
1625.T,6981,村田製作所
1625.T,6702,富士通
1625.T,6594,ニデック
1625.T,6762,TDK
1625.T,7741,HOYA
1625.T,6861,キーエンス
1625.T,6971,京セラ
1626.T,9432,日本電信電話
1626.T,6098,リクルートホールディングス
1626.T,9433,KDDI
1626.T,9984,ソフトバンクグループ
1626.T,7974,任天堂
1626.T,4661,オリエンタルランド
1626.T,9434,ソフトバンク
1626.T,4755,楽天グループ
1626.T,4324,電通グループ
1626.T,3659,ネクソン
1627.T,9501,東京電力ホールディングス
1627.T,9503,関西電力
1627.T,9502,中部電力
1627.T,9504,中国電力
1627.T,9506,東北電力
1627.T,9508,九州電力
1627.T,9531,東京ガス
1627.T,9532,大阪ガス
1627.T,9509,北海道電力
1627.T,9513,電源開発
1628.T,9022,東海旅客鉄道
1628.T,9020,東日本旅客鉄道
1628.T,9101,日本郵船
1628.T,9021,西日本旅客鉄道
1628.T,9104,商船三井
1628.T,9107,川崎汽船
1628.T,9064,ヤマトホールディングス
1628.T,9201,日本航空
1628.T,9202,ANAホールディングス
1628.T,9005,東急
1629.T,8058,三菱商事
1629.T,8001,伊藤忠商事
1629.T,8031,三井物産
1629.T,8002,丸紅
1629.T,8053,住友商事
1629.T,8015,豊田通商
1629.T,8136,サンリオ
1629.T,2768,双日
1629.T,3038,神戸物産
1629.T,9962,ミスミグループ本社
1630.T,9983,ファーストリテイリング
1630.T,3382,セブン＆アイ・ホールディングス
1630.T,8267,イオン
1630.T,7532,パン・パシフィック・インターナショナルホールディングス
1630.T,2651,ローソン
1630.T,3099,三越伊勢丹ホールディングス
1630.T,7453,良品計画
1630.T,9843,ニトリホールディングス
1630.T,3088,マツキヨココカラ＆カンパニー
1630.T,8233,高島屋
1631.T,8306,三菱UFJフィナンシャル・グループ
1631.T,8316,三井住友フィナンシャルグループ
1631.T,8411,みずほフィナンシャルグループ
1631.T,8309,三井住友トラスト・ホールディングス
1631.T,7186,コンコルディア・フィナンシャルグループ
1631.T,8308,りそなホールディングス
1631.T,8334,千葉銀行
1631.T,8354,ふくおかフィナンシャルグループ
1631.T,8355,静岡銀行
1631.T,8331,京都銀行
1632.T,8766,東京海上ホールディングス
1632.T,8725,MS&ADインシュアランスグループホールディングス
1632.T,8750,第一生命ホールディングス
1632.T,8630,SOMPOホールディングス
1632.T,8591,オリックス
1632.T,8604,野村ホールディングス
1632.T,8795,T&Dホールディングス
1632.T,8473,SBIホールディングス
1632.T,8697,日本取引所グループ
1632.T,8601,大和証券グループ本社
1633.T,8801,三井不動産
1633.T,8802,三菱地所
1633.T,8830,住友不動産
1633.T,1878,大東建託
1633.T,3003,ヒューリック
1633.T,3289,東急不動産ホールディングス
1633.T,3231,野村不動産ホールディングス
1633.T,8804,東京建物
1633.T,3288,オープンハウスグループ
1633.T,3291,飯田グループホールディングス"""
    
    constituents_map = {}
    
    # CSV文字列をパース
    csv_reader = csv.DictReader(io.StringIO(csv_data))
    
    for row in csv_reader:
        etf_ticker = row['etf-ticker'].strip()
        ticker = row['ticker'].strip()
        name = row['銘柄'].strip()
        
        # ティッカーが空の場合はスキップ
        if not ticker or not name:
            continue
            
        # ETFティッカーがキーとして存在しない場合は初期化
        if etf_ticker not in constituents_map:
            constituents_map[etf_ticker] = []
        
        # 構成銘柄を追加
        constituents_map[etf_ticker].append({
            "ticker": ticker,
            "name": name
        })
    
    # 各セクターの銘柄数をログ出力
    for etf_ticker, constituents in constituents_map.items():
        sector_name = SECTOR_ETFS.get(etf_ticker, etf_ticker)
        logging.info(f"{sector_name} ({etf_ticker}): {len(constituents)}銘柄")
    
    return constituents_map

# CSVファイルから構成銘柄マップを読み込み
CONSTITUENTS_MAP = load_constituents_from_csv_file()

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

def format_ticker_for_yfinance(ticker):
    """日本株のティッカーをyfinance用にフォーマット"""
    if not ticker.endswith('.T'):
        return f"{ticker}.T"
    return ticker

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
        "latest_available_date": latest_available.strftime('%Y-%m-%d')  # デバッグ情報
    }

@app.get("/constituents")
def get_constituents_data(
    sector_ticker: str = Query(..., description="セクターETFのティッカー (例: 1617.T)"),
    period: str = Query("5d", description="分析期間 (1d, 5d, 1mo, 3mo, ytd, 1y)")
):
    """指定されたセクターの構成銘柄データを取得"""
    
    if sector_ticker not in CONSTITUENTS_MAP:
        raise HTTPException(
            status_code=404, 
            detail=f"セクター {sector_ticker} の構成銘柄データが見つかりません。利用可能なセクター: {list(CONSTITUENTS_MAP.keys())}"
        )
    
    constituents = CONSTITUENTS_MAP[sector_ticker]
    
    # yfinance用のティッカーリストを作成
    tickers_for_yf = [format_ticker_for_yfinance(c["ticker"]) for c in constituents]
    
    try:
        logging.info(f"構成銘柄データ取得中: {sector_ticker} ({len(constituents)}銘柄), 期間: {period}")
        
        # 期間に応じたyfinanceパラメータの設定
        yf_params = {}
        period_display = period
        
        if period == "ytd":
            # 年初来の場合、今年の1月1日から現在まで
            current_year = datetime.now().year
            start_date = f"{current_year}-01-01"
            yf_params = {"start": start_date}
            period_display = f"{current_year}年初来"
        elif period == "1y":
            # 過去1年の場合
            yf_params = {"period": "1y"}
            period_display = "過去1年"
        else:
            # その他の期間
            yf_params = {"period": period}
            period_display = period
        
        # 株価データ取得
        raw_data = yfinance.download(
            tickers_for_yf,
            progress=False,
            **yf_params
        )
        
        if raw_data.empty:
            raise HTTPException(status_code=404, detail="構成銘柄の株価データを取得できませんでした。")
        
        # データ整形
        result_data = []
        
        for i, constituent in enumerate(constituents):
            ticker = constituent["ticker"]
            name = constituent["name"]
            yf_ticker = format_ticker_for_yfinance(ticker)
            
            try:
                if len(tickers_for_yf) == 1:
                    # 単一銘柄の場合
                    close_data = raw_data['Close']
                    volume_data = raw_data['Volume']
                else:
                    # 複数銘柄の場合
                    close_data = raw_data['Close'][yf_ticker]
                    volume_data = raw_data['Volume'][yf_ticker]
                
                close_data = close_data.dropna()
                volume_data = volume_data.dropna()
                
                if len(close_data) < 2:
                    logging.warning(f"銘柄 {ticker} ({name}) のデータが不十分です")
                    continue
                    
                # 最新価格と変化率を計算
                latest_price = close_data.iloc[-1]
                latest_volume = volume_data.iloc[-1] if len(volume_data) > 0 else 0
                
                # 期間に応じた変化率計算
                if period == "1d":
                    change_pct = close_data.pct_change().iloc[-1] * 100
                elif period in ["ytd", "1y"]:
                    # 年初来・過去1年の場合、期間全体での変化率
                    change_pct = ((latest_price / close_data.iloc[0]) - 1) * 100
                else:
                    # その他の期間
                    change_pct = ((latest_price / close_data.iloc[0]) - 1) * 100
                
                result_data.append({
                    "ticker": ticker,
                    "name": name,
                    "price": round(float(latest_price), 2),
                    "change_pct": round(float(change_pct), 2),
                    "volume": int(latest_volume) if not pd.isna(latest_volume) else 0,
                    "chart_data": [
                        {
                            "date": date.strftime('%Y-%m-%d'),
                            "price": round(float(price), 2)
                        }
                        for date, price in close_data.items()
                        if not pd.isna(price)
                    ]
                })
                
            except Exception as e:
                logging.warning(f"銘柄 {ticker} ({name}) のデータ取得に失敗: {str(e)}")
                continue
        
        # 統計情報計算
        if result_data:
            change_pcts = [d["change_pct"] for d in result_data if not pd.isna(d["change_pct"])]
            if change_pcts:
                stats = {
                    "avg_change": round(sum(change_pcts) / len(change_pcts), 2),
                    "max_change": round(max(change_pcts), 2),
                    "min_change": round(min(change_pcts), 2),
                    "total_constituents": len(result_data)
                }
            else:
                stats = {"avg_change": 0, "max_change": 0, "min_change": 0, "total_constituents": len(result_data)}
        else:
            stats = {"avg_change": 0, "max_change": 0, "min_change": 0, "total_constituents": 0}
        
        logging.info(f"セクター {sector_ticker}: {len(result_data)}銘柄のデータ取得完了")
        
        return {
            "sector_name": SECTOR_ETFS.get(sector_ticker, sector_ticker),
            "sector_ticker": sector_ticker,
            "period": period,
            "period_display": period_display,  # 表示用の期間名を追加
            "constituents": result_data,
            "stats": stats
        }
        
    except Exception as e:
        logging.error(f"構成銘柄データ取得エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"データ取得エラー: {str(e)}")

@app.get("/sector_list")
def get_sector_list():
    """利用可能なセクター一覧を取得"""
    return {
        "sectors": [
            {
                "ticker": ticker,
                "name": name,
                "has_constituents": ticker in CONSTITUENTS_MAP,
                "constituent_count": len(CONSTITUENTS_MAP.get(ticker, []))
            }
            for ticker, name in SECTOR_ETFS.items()
        ]
    }

# 静的ファイル配信機能
app.mount("/", StaticFiles(directory="static", html=True), name="static")