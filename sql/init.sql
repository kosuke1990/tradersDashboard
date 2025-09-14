-- ====================================================================
-- 修正版データベース初期化スクリプト（パーティション対応）
-- ====================================================================

-- 拡張機能の有効化
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ベンチマーク情報テーブル
CREATE TABLE IF NOT EXISTS benchmarks (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. セクターETF情報テーブル
CREATE TABLE IF NOT EXISTS sector_etfs (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    sector_category VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. 構成銘柄情報テーブル
CREATE TABLE IF NOT EXISTS constituents (
    id SERIAL PRIMARY KEY,
    etf_ticker VARCHAR(20) NOT NULL,
    constituent_ticker VARCHAR(20) NOT NULL,
    company_name VARCHAR(200) NOT NULL,
    weight DECIMAL(8,4),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(etf_ticker, constituent_ticker)
);

-- 4. 日次価格データテーブル（パーティション対応・修正版）
CREATE TABLE IF NOT EXISTS daily_prices (
    id BIGSERIAL,
    ticker VARCHAR(20) NOT NULL,
    date DATE NOT NULL,
    open_price DECIMAL(12,4),
    high_price DECIMAL(12,4),
    low_price DECIMAL(12,4),
    close_price DECIMAL(12,4) NOT NULL,
    volume BIGINT,
    adjusted_close DECIMAL(12,4),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- パーティションテーブルではPRIMARY KEYにパーティションキー（date）を含める必要がある
    PRIMARY KEY (id, date),
    UNIQUE(ticker, date)
) PARTITION BY RANGE (date);

-- 5. RRG計算結果キャッシュテーブル
CREATE TABLE IF NOT EXISTS rrg_calculations (
    id BIGSERIAL PRIMARY KEY,
    benchmark_ticker VARCHAR(20) NOT NULL,
    sector_ticker VARCHAR(20) NOT NULL,
    calculation_date DATE NOT NULL,
    rs_ratio DECIMAL(10,4) NOT NULL,
    rs_momentum DECIMAL(10,4) NOT NULL,
    quadrant VARCHAR(20) NOT NULL,
    price DECIMAL(12,4) NOT NULL,
    change_pct DECIMAL(8,4) NOT NULL,
    weekly_change_pct DECIMAL(8,4),
    tail_data TEXT, -- JSONBの代わりにTEXTを使用
    calculation_params TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(benchmark_ticker, sector_ticker, calculation_date)
);

-- 6. データ更新ログテーブル
CREATE TABLE IF NOT EXISTS data_update_logs (
    id SERIAL PRIMARY KEY,
    update_type VARCHAR(50) NOT NULL,
    ticker VARCHAR(20),
    update_date DATE NOT NULL,
    records_updated INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'success',
    error_message TEXT,
    execution_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== 日次価格データのパーティション作成 =====
-- 各パーティションにもPRIMARY KEYにdateを含める
CREATE TABLE IF NOT EXISTS daily_prices_2023 PARTITION OF daily_prices 
    FOR VALUES FROM ('2023-01-01') TO ('2024-01-01');
    
CREATE TABLE IF NOT EXISTS daily_prices_2024 PARTITION OF daily_prices 
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
    
CREATE TABLE IF NOT EXISTS daily_prices_2025 PARTITION OF daily_prices 
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
    
CREATE TABLE IF NOT EXISTS daily_prices_2026 PARTITION OF daily_prices 
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

-- ===== インデックス作成 =====
-- 日次価格データの高速検索用
CREATE INDEX IF NOT EXISTS idx_daily_prices_ticker_date ON daily_prices (ticker, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_prices_date ON daily_prices (date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_prices_ticker ON daily_prices (ticker);

-- RRG計算結果の高速検索用
CREATE INDEX IF NOT EXISTS idx_rrg_calc_benchmark_date ON rrg_calculations (benchmark_ticker, calculation_date DESC);
CREATE INDEX IF NOT EXISTS idx_rrg_calc_sector_date ON rrg_calculations (sector_ticker, calculation_date DESC);
CREATE INDEX IF NOT EXISTS idx_rrg_calc_quadrant ON rrg_calculations (quadrant);

-- 構成銘柄の高速検索用
CREATE INDEX IF NOT EXISTS idx_constituents_etf ON constituents (etf_ticker);

-- データ更新ログの検索用
CREATE INDEX IF NOT EXISTS idx_update_logs_date ON data_update_logs (update_date DESC);
CREATE INDEX IF NOT EXISTS idx_update_logs_ticker ON data_update_logs (ticker);

-- ===== 初期データ投入 =====
INSERT INTO benchmarks (ticker, name, description) VALUES
('1306.T', 'TOPIX ETF', 'TOPIX連動型上場投資信託'),
('1321.T', '日経225 ETF', '日経225連動型上場投資信託')
ON CONFLICT (ticker) DO NOTHING;

INSERT INTO sector_etfs (ticker, name, sector_category) VALUES
('1617.T', '食品', 'Consumer Staples'),
('1618.T', 'エネ資源', 'Energy'),
('1619.T', '建設資材', 'Materials'),
('1620.T', '素材化学', 'Materials'),
('1621.T', '医薬品', 'Healthcare'),
('1622.T', '自動車', 'Consumer Discretionary'),
('1623.T', '鉄非鉄', 'Materials'),
('1624.T', '機械', 'Industrials'),
('1625.T', '電機精密', 'Technology'),
('1626.T', '情通サービス', 'Communication Services'),
('1627.T', '電力ガス', 'Utilities'),
('1628.T', '運輸物流', 'Industrials'),
('1629.T', '商社卸売', 'Industrials'),
('1630.T', '小売', 'Consumer Discretionary'),
('1631.T', '銀行', 'Financials'),
('1632.T', '金融(銀除)', 'Financials'),
('1633.T', '不動産', 'Real Estate')
ON CONFLICT (ticker) DO NOTHING;

-- サンプル構成銘柄（食品セクターのみ）
INSERT INTO constituents (etf_ticker, constituent_ticker, company_name) VALUES
('1617.T', '2502.T', 'アサヒグループホールディングス'),
('1617.T', '2914.T', '日本たばこ産業'),
('1617.T', '2503.T', 'キリンホールディングス'),
('1617.T', '2802.T', '味の素'),
('1617.T', '2269.T', '明治ホールディングス')
ON CONFLICT (etf_ticker, constituent_ticker) DO NOTHING;

-- ===== 関数作成 =====
-- データ更新時刻を自動更新する関数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- updated_atカラムのトリガー設定
DROP TRIGGER IF EXISTS update_benchmarks_updated_at ON benchmarks;
CREATE TRIGGER update_benchmarks_updated_at BEFORE UPDATE ON benchmarks 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sector_etfs_updated_at ON sector_etfs;
CREATE TRIGGER update_sector_etfs_updated_at BEFORE UPDATE ON sector_etfs 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_constituents_updated_at ON constituents;
CREATE TRIGGER update_constituents_updated_at BEFORE UPDATE ON constituents 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rrg_calculations_updated_at ON rrg_calculations;
CREATE TRIGGER update_rrg_calculations_updated_at BEFORE UPDATE ON rrg_calculations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===== 便利なビュー作成 =====
CREATE OR REPLACE VIEW latest_rrg_data AS
SELECT 
    r.*,
    s.name as sector_name,
    s.sector_category,
    b.name as benchmark_name
FROM rrg_calculations r
JOIN sector_etfs s ON r.sector_ticker = s.ticker
JOIN benchmarks b ON r.benchmark_ticker = b.ticker
WHERE r.calculation_date = (
    SELECT MAX(calculation_date) 
    FROM rrg_calculations r2 
    WHERE r2.benchmark_ticker = r.benchmark_ticker 
    AND r2.sector_ticker = r.sector_ticker
);

CREATE OR REPLACE VIEW data_freshness_summary AS
SELECT 
    ticker,
    MAX(date) as latest_date,
    COUNT(*) as total_records,
    COUNT(*) FILTER (WHERE date >= CURRENT_DATE - INTERVAL '30 days') as records_last_30_days
FROM daily_prices 
GROUP BY ticker
ORDER BY latest_date DESC;

-- 初期化完了ログ
INSERT INTO data_update_logs (update_type, update_date, records_updated, status, error_message) 
VALUES ('database_init', CURRENT_DATE, 0, 'success', 'Database schema initialized successfully');

-- 完了メッセージ
SELECT 
    'Database initialization completed successfully!' as status,
    CURRENT_TIMESTAMP as completed_at,
    (SELECT COUNT(*) FROM sector_etfs) as sector_etfs_count,
    (SELECT COUNT(*) FROM constituents) as constituents_count,
    (SELECT COUNT(*) FROM benchmarks) as benchmarks_count;