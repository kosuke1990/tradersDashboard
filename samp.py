# ==============================================================================
# Step 1: ライブラリのインポートと基本設定
# ==============================================================================
import yfinance as yf
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px # 色を生成するために追加

# ==============================================================================
# Step 2: 分析対象のETFとベンチマークを設定
# ==============================================================================
# ベンチマーク (TOPIX連動型ETF)
benchmark_ticker = "1306.T"

# TOPIX-17 セクターETFのリスト
sector_etfs = {
    "1617.T": "食品", "1618.T": "エネ資源", "1619.T": "建設資材",
    "1620.T": "素材化学", "1621.T": "医薬品", "1622.T": "自動車",
    "1623.T": "鉄非鉄", "1624.T": "機械", "1625.T": "電機精密",
    "1626.T": "情通サービス", "1627.T": "電力ガス", "1628.T": "運輸物流",
    "1629.T": "商社卸売", "1630.T": "小売", "1631.T": "銀行",
    "1632.T": "金融(銀除)", "1633.T": "不動産"
}

# 期間設定
period = "1y"
# 軌跡（しっぽ）の期間を設定
tail_length = 5

# ==============================================================================
# Step 3: Yahoo Financeから株価データを取得
# ==============================================================================
all_tickers = [benchmark_ticker] + list(sector_etfs.keys())
raw_data = yf.download(all_tickers, period=period)
data = raw_data['Close']
data.dropna(inplace=True)

print("データの抽出が完了しました。")
print(f"データ期間: {data.index.min().strftime('%Y-%m-%d')} to {data.index.max().strftime('%Y-%m-%d')}")

# ==============================================================================
# Step 4: RRGの計算
# ==============================================================================
rs = pd.DataFrame()
for ticker in sector_etfs.keys():
    rs[ticker] = data[ticker] / data[benchmark_ticker]

rs_ratio = 100 + ((rs / rs.rolling(window=52).mean()) - 1) * 100
rs_momentum = 100 + rs.pct_change(periods=4).rolling(window=13).mean() * 100

latest_rrg = pd.DataFrame({
    'symbol': list(sector_etfs.keys()),
    'name': list(sector_etfs.values()),
    'x': rs_ratio.iloc[-1],
    'y': rs_momentum.iloc[-1],
})

# ==============================================================================
# Step 5: PlotlyでRRGチャートを描画 (★エラー修正版★)
# ==============================================================================
fig = go.Figure()
x_mean = latest_rrg['x'].mean()
y_mean = latest_rrg['y'].mean()

# 象限の背景色を設定
fig.add_shape(type="rect", xref="x", yref="y", x0=x_mean, y0=y_mean, x1=latest_rrg['x'].max()+1, y1=latest_rrg['y'].max()+1, fillcolor="lightgreen", opacity=0.2, layer="below", line_width=0)
fig.add_shape(type="rect", xref="x", yref="y", x0=latest_rrg['x'].min()-1, y0=y_mean, x1=x_mean, y1=latest_rrg['y'].max()+1, fillcolor="lightblue", opacity=0.2, layer="below", line_width=0)
fig.add_shape(type="rect", xref="x", yref="y", x0=latest_rrg['x'].min()-1, y0=latest_rrg['y'].min()-1, x1=x_mean, y1=y_mean, fillcolor="lightpink", opacity=0.2, layer="below", line_width=0)
fig.add_shape(type="rect", xref="x", yref="y", x0=x_mean, y0=latest_rrg['y'].min()-1, x1=latest_rrg['x'].max()+1, y1=y_mean, fillcolor="lightyellow", opacity=0.2, layer="below", line_width=0)

colors = px.colors.qualitative.Plotly
color_map = {ticker: colors[i % len(colors)] for i, ticker in enumerate(sector_etfs.keys())}

for ticker, name in sector_etfs.items():
    x_hist = rs_ratio[ticker].tail(tail_length)
    y_hist = rs_momentum[ticker].tail(tail_length)

    # ★★★★★ ここを修正しました ★★★★★
    # HEX形式の色コードをRGBA形式に変換して透明度を設定
    hex_color = color_map[ticker]
    r, g, b = tuple(int(hex_color.lstrip('#')[i:i+2], 16) for i in (0, 2, 4))
    rgba_color = f'rgba({r}, {g}, {b}, 0.6)' # 透明度を0.6に設定

    # 軌跡（線）を描画
    fig.add_trace(go.Scatter(
        x=x_hist,
        y=y_hist,
        mode='lines',
        line=dict(color=rgba_color, width=1.5), # RGBA形式の色を使用
        name=f'{name} (軌跡)',
        hoverinfo='none',
        showlegend=False
    ))

    # 最新の点（現在の位置）を強調して描画
    fig.add_trace(go.Scatter(
        x=[x_hist.iloc[-1]],
        y=[y_hist.iloc[-1]],
        mode='markers+text',
        marker=dict(size=10, color=color_map[ticker], line=dict(width=1, color='DarkSlateGrey')),
        text=[name],
        textposition="top right",
        name=name,
        hoverinfo='text',
        hovertext=f'{name}<br>RS-Ratio: {x_hist.iloc[-1]:.2f}<br>RS-Momentum: {y_hist.iloc[-1]:.2f}',
        showlegend=True
    ))

# 中心線
fig.add_hline(y=y_mean, line_width=1, line_dash="dash", line_color="grey")
fig.add_vline(x=x_mean, line_width=1, line_dash="dash", line_color="grey")

# 象限ラベル
fig.add_annotation(x=latest_rrg['x'].max(), y=latest_rrg['y'].max(), text="Leading (リード)", showarrow=False, font=dict(color="green", size=14), xshift=-50, yshift=-10)
fig.add_annotation(x=latest_rrg['x'].min(), y=latest_rrg['y'].max(), text="Improving (改善)", showarrow=False, font=dict(color="blue", size=14), xshift=50, yshift=-10)
fig.add_annotation(x=latest_rrg['x'].min(), y=latest_rrg['y'].min(), text="Lagging (遅行)", showarrow=False, font=dict(color="red", size=14), xshift=50, yshift=10)
fig.add_annotation(x=latest_rrg['x'].max(), y=latest_rrg['y'].min(), text="Weakening (悪化)", showarrow=False, font=dict(color="orange", size=14), xshift=-50, yshift=10)

# レイアウト設定
fig.update_layout(
    title=f'日本株セクター RRG (ベンチマーク: TOPIX) - {data.index.max().strftime("%Y-%m-%d")}',
    xaxis_title='RS-Ratio (相対力)',
    yaxis_title='RS-Momentum (モメンタム)',
    width=1000,
    height=1000,
    plot_bgcolor='white',
    xaxis=dict(showgrid=True, gridwidth=1, gridcolor='lightgrey'),
    yaxis=dict(showgrid=True, gridwidth=1, gridcolor='lightgrey'),
    hovermode='closest',
    showlegend=True,
    legend_title_text='セクター',
    margin=dict(l=50, r=50, t=80, b=50)
)

fig.show()