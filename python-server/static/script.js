/**
 * Enhanced Interactive Sector Rotation Dashboard
 * With Time-axis, Tail-length Sliders and Constituents Performance
 */

// --- グローバル設定 ---
const API_ENDPOINT = '/calculate';
const BENCHMARKS = {
    '1306.T': 'TOPIX ETF',
    '1321.T': '日経225 ETF'
};

// セクターとETFのマッピング
const SECTOR_ETFS = {
    "1617.T": "食品", "1618.T": "エネ資源", "1619.T": "建設資材",
    "1620.T": "素材化学", "1621.T": "医薬品", "1622.T": "自動車",
    "1623.T": "鉄非鉄", "1624.T": "機械", "1625.T": "電機精密",
    "1626.T": "情通サービス", "1627.T": "電力ガス", "1628.T": "運輸物流",
    "1629.T": "商社卸売", "1630.T": "小売", "1631.T": "銀行",
    "1632.T": "金融(銀除)", "1633.T": "不動産"
};

// 構成銘柄データ（CSVデータを基に）
const CONSTITUENTS_DATA = {
    "1617.T": [
        { ticker: "2502.T", name: "アサヒグループホールディングス" },
        { ticker: "2914.T", name: "日本たばこ産業" },
        { ticker: "2503.T", name: "キリンホールディングス" },
        { ticker: "2802.T", name: "味の素" },
        { ticker: "2269.T", name: "明治ホールディングス" },
        { ticker: "2587.T", name: "サントリー食品インターナショナル" },
        { ticker: "2897.T", name: "日清食品ホールディングス" },
        { ticker: "2264.T", name: "森永乳業" },
        { ticker: "2875.T", name: "東洋水産" },
        { ticker: "2501.T", name: "サッポロホールディングス" }
    ],
    "1622.T": [
        { ticker: "7203.T", name: "トヨタ自動車" },
        { ticker: "7267.T", name: "本田技研工業" },
        { ticker: "6902.T", name: "デンソー" },
        { ticker: "7201.T", name: "日産自動車" },
        { ticker: "7269.T", name: "スズキ" },
        { ticker: "6503.T", name: "三菱電機" },
        { ticker: "7272.T", name: "ヤマハ発動機" },
        { ticker: "6981.T", name: "村田製作所" },
        { ticker: "7270.T", name: "SUBARU" },
        { ticker: "6920.T", name: "レーザーテック" }
    ],
    "1630.T": [
        { ticker: "9983.T", name: "ファーストリテイリング" },
        { ticker: "3382.T", name: "セブン＆アイ・ホールディングス" },
        { ticker: "8267.T", name: "イオン" },
        { ticker: "7532.T", name: "パン・パシフィック・インターナショナルホールディングス" },
        { ticker: "2651.T", name: "ローソン" },
        { ticker: "3099.T", name: "三越伊勢丹ホールディングス" },
        { ticker: "7453.T", name: "良品計画" },
        { ticker: "9843.T", name: "ニトリホールディングス" },
        { ticker: "3088.T", name: "マツキヨココカラ＆カンパニー" },
        { ticker: "8233.T", name: "高島屋" }
    ],
    "1631.T": [
        { ticker: "8306.T", name: "三菱UFJフィナンシャル・グループ" },
        { ticker: "8316.T", name: "三井住友フィナンシャルグループ" },
        { ticker: "8411.T", name: "みずほフィナンシャルグループ" },
        { ticker: "8309.T", name: "三井住友トラスト・ホールディングス" },
        { ticker: "7186.T", name: "コンコルディア・フィナンシャルグループ" },
        { ticker: "8308.T", name: "りそなホールディングス" },
        { ticker: "8334.T", name: "千葉銀行" },
        { ticker: "8354.T", name: "ふくおかフィナンシャルグループ" },
        { ticker: "8355.T", name: "静岡銀行" },
        { ticker: "8331.T", name: "京都銀行" }
    ],
    "1633.T": [
        { ticker: "8801.T", name: "三井不動産" },
        { ticker: "8802.T", name: "三菱地所" },
        { ticker: "8830.T", name: "住友不動産" },
        { ticker: "1878.T", name: "大東建託" },
        { ticker: "3003.T", name: "ヒューリック" },
        { ticker: "3289.T", name: "東急不動産ホールディングス" },
        { ticker: "3231.T", name: "野村不動産ホールディングス" },
        { ticker: "8804.T", name: "東京建物" },
        { ticker: "3288.T", name: "オープンハウスグループ" },
        { ticker: "3291.T", name: "飯田グループホールディングス" }
    ]
};

const SERIES_COLORS = [
    '#e6194B', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', 
    '#f032e6', '#bcf60c', '#008080', '#e6beff', '#9A6324', '#800000', 
    '#aaffc3', '#808000', '#000075'
];

// --- アプリケーションの状態管理 ---
const state = {
    benchmark: '1306.T',
    targetDate: new Date().toISOString().split('T')[0],
    dashboardData: { benchmark_ohlc: [], historical_data: {}, date_range: [] },
    visibleSectors: new Set(),
    isLoading: true,
    // 新しい状態
    currentDateIndex: 0,
    tailLength: 5,
    activeTab: 'rrg',
    selectedSector: '1617.T',
    selectedPeriod: '1m'
};

// --- チャートインスタンス ---
let rrgChart = null;
let performanceChart = null;

// DOM読み込み完了後にアプリケーションを初期化
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    const elements = getElements();
    
    initializeBenchmarkSelector(elements);
    initializeCharts(elements);
    initializeSliders(elements);
    initializeTabs(elements);
    initializeSectorButtons(elements);
    addEventListeners(elements);
    fetchDashboardData(elements);
}

function getElements() {
    return {
        benchmarkSelect: document.getElementById('benchmark-select'),
        dateDisplay: document.getElementById('date-display'),
        rrgChartContainer: document.getElementById('rrg-chart'),
        longCandidateTable: document.getElementById('long-candidate-table'),
        shortCandidateTable: document.getElementById('short-candidate-table'),
        fullDataTableBody: document.getElementById('full-data-table-body'),
        dashboardContainer: document.querySelector('.dashboard-container'),
        resetZoomBtn: document.getElementById('reset-zoom-btn'),
        timeAxisSlider: document.getElementById('time-axis-slider'),
        tailLengthSlider: document.getElementById('tail-length-slider'),
        timeAxisValue: document.getElementById('time-axis-value'),
        tailLengthValue: document.getElementById('tail-length-value'),
        exportMenuBtn: document.getElementById('export-menu-btn'),
        exportDropdown: document.getElementById('export-dropdown'),
        tabButtons: document.querySelectorAll('.tab-button'),
        tabContents: document.querySelectorAll('.tab-content'),
        sectorButtons: document.getElementById('sector-buttons'),
        performanceChartContainer: document.getElementById('performance-chart'),
        chartTitle: document.getElementById('chart-title'),
        periodButtons: document.querySelectorAll('.period-btn'),
        selectAllBtn: document.getElementById('select-all-btn'),
        clearAllBtn: document.getElementById('clear-all-btn')
    };
}

function initializeBenchmarkSelector(elements) {
    if (!elements.benchmarkSelect) {
        console.error('benchmark-select element not found');
        return;
    }
    const select = elements.benchmarkSelect;
    Object.entries(BENCHMARKS).forEach(([ticker, name]) => {
        const option = new Option(`${name} (${ticker})`, ticker);
        select.appendChild(option);
    });
    select.value = state.benchmark;
}

function initializeCharts(elements) {
    if (!elements.rrgChartContainer) {
        console.error('rrg-chart container not found');
        return;
    }
    rrgChart = echarts.init(elements.rrgChartContainer);
    
    if (!elements.performanceChartContainer) {
        console.error('performance-chart container not found');
        return;
    }
    performanceChart = echarts.init(elements.performanceChartContainer);

    window.addEventListener('resize', () => {
        rrgChart?.resize();
        performanceChart?.resize();
    });
}

function initializeSliders(elements) {
    // 時間軸スライダーの初期化（データ取得後に設定）
    if (elements.timeAxisSlider) {
        elements.timeAxisSlider.addEventListener('input', (e) => {
            state.currentDateIndex = parseInt(e.target.value);
            updateCurrentDisplay(elements);
        });
    }
    
    // 軌跡長さスライダーの初期化
    if (elements.tailLengthSlider) {
        elements.tailLengthSlider.value = state.tailLength;
        if (elements.tailLengthValue) {
            elements.tailLengthValue.textContent = `${state.tailLength}日`;
        }
        
        elements.tailLengthSlider.addEventListener('input', (e) => {
            state.tailLength = parseInt(e.target.value);
            if (elements.tailLengthValue) {
                elements.tailLengthValue.textContent = `${state.tailLength}日`;
            }
            renderRRGChart(elements); // RRGチャートのみ再描画
        });
    }
}

function initializeTabs(elements) {
    elements.tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;
            switchTab(targetTab, elements);
        });
    });
}

function initializeSectorButtons(elements) {
    const container = elements.sectorButtons;
    if (!container) {
        console.error('sector-buttons container not found');
        return;
    }
    
    container.innerHTML = '';
    
    Object.entries(SECTOR_ETFS).forEach(([ticker, name]) => {
        const button = document.createElement('button');
        button.className = 'sector-btn';
        button.dataset.sector = ticker;
        button.textContent = name;
        
        if (ticker === state.selectedSector) {
            button.classList.add('active');
        }
        
        button.addEventListener('click', () => {
            selectSector(ticker, elements);
        });
        
        container.appendChild(button);
    });
}

// イベントリスナーの追加（安全版）
function addEventListeners(elements) {
    // 必須要素のnullチェック
    if (elements.benchmarkSelect) {
        elements.benchmarkSelect.addEventListener('change', (e) => {
            state.benchmark = e.target.value;
            state.visibleSectors.clear(); 
            fetchDashboardData(elements);
        });
    } else {
        console.error('benchmarkSelect element is null');
    }

    if (elements.fullDataTableBody) {
        elements.fullDataTableBody.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                const ticker = e.target.dataset.ticker;
                if (e.target.checked) {
                    state.visibleSectors.add(ticker);
                } else {
                    state.visibleSectors.delete(ticker);
                }
                renderRRGChart(elements);
            }
        });
    } else {
        console.error('fullDataTableBody element is null');
    }

    if (elements.resetZoomBtn) {
        elements.resetZoomBtn.addEventListener('click', () => {
            rrgChart?.dispatchAction({ type: 'restore' });
        });
    } else {
        console.error('resetZoomBtn element is null');
    }

    // ケバブメニューのイベントリスナー（安全版）
    if (elements.exportMenuBtn && elements.exportDropdown) {
        console.log('ケバブメニューのイベントリスナーを設定');
        
        // メニューの開閉
        elements.exportMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            elements.exportDropdown.classList.toggle('show');
        });
        
        // メニュー項目のクリック
        elements.exportDropdown.addEventListener('click', (e) => {
            const item = e.target.closest('.export-dropdown-item');
            if (item) {
                const format = item.dataset.format;
                exportData(format);
                elements.exportDropdown.classList.remove('show');
            }
        });
        
        // 外側をクリックしたらメニューを閉じる
        document.addEventListener('click', () => {
            elements.exportDropdown.classList.remove('show');
        });
    } else {
        console.warn('ケバブメニュー要素が見つかりません:', {
            exportMenuBtn: !!elements.exportMenuBtn,
            exportDropdown: !!elements.exportDropdown
        });
    }

    // 期間選択ボタンのイベントリスナー
    elements.periodButtons.forEach(button => {
        button.addEventListener('click', () => {
            const period = button.dataset.period;
            selectPeriod(period, elements);
        });
    });
    // 新しく追加：チェックボックス一括操作
    if (elements.selectAllBtn) {
        elements.selectAllBtn.addEventListener('click', () => {
            selectAllCheckboxes(elements);
        });
    }

    if (elements.clearAllBtn) {
        elements.clearAllBtn.addEventListener('click', () => {
            clearAllCheckboxes(elements);
        });
    }
}

function switchTab(tabName, elements) {
    state.activeTab = tabName;
    
    // タブボタンの状態更新
    elements.tabButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // タブコンテンツの表示切り替え
    elements.tabContents.forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}-tab`);
    });

    // 構成銘柄タブがアクティブになった時の処理
    if (tabName === 'constituents') {
        updatePerformanceChart(elements);
    }
}

function selectSector(sectorTicker, elements) {
    state.selectedSector = sectorTicker;
    
    // セクターボタンの状態更新
    elements.sectorButtons.querySelectorAll('.sector-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sector === sectorTicker);
    });
    
    // チャートタイトル更新
    const sectorName = SECTOR_ETFS[sectorTicker];
    elements.chartTitle.textContent = `${sectorName} 構成銘柄パフォーマンス`;
    
    // パフォーマンスチャート更新
    updatePerformanceChart(elements);
}

function selectPeriod(period, elements) {
    state.selectedPeriod = period;
    
    // 期間ボタンの状態更新
    elements.periodButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.period === period);
    });
    
    // パフォーマンスチャート更新
    updatePerformanceChart(elements);
}

function updatePerformanceChart(elements) {
    if (!CONSTITUENTS_DATA[state.selectedSector]) {
        performanceChart.setOption({
            title: {
                text: 'このセクターの構成銘柄データは準備中です',
                left: 'center',
                top: 'middle',
                textStyle: {
                    fontSize: 16,
                    color: '#666'
                }
            }
        });
        return;
    }

    // 模擬データでパフォーマンスチャートを描画
    const constituents = CONSTITUENTS_DATA[state.selectedSector];
    const periodDays = getPeriodDays(state.selectedPeriod);
    
    // X軸のカテゴリ（期間に応じて調整）
    const categories = generateCategories(periodDays);
    
    // 各銘柄のパフォーマンスデータを生成（模擬データ）
    const series = constituents.map((stock, index) => {
        return {
            name: stock.name,
            type: 'line',
            data: generatePerformanceData(periodDays, index),
            symbol: 'none',
            lineStyle: {
                width: 2
            },
            emphasis: {
                focus: 'series'
            }
        };
    });

    const option = {
        title: {
            text: '',
            left: 'center'
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: {
                type: 'cross'
            },
            formatter: function(params) {
                let result = `${params[0].axisValue}<br/>`;
                params.forEach(param => {
                    const value = param.value;
                    const color = value >= 0 ? '#26A69A' : '#EF5350';
                    const sign = value >= 0 ? '+' : '';
                    result += `<span style="color:${param.color};">●</span> ${param.seriesName}: <span style="color:${color};">${sign}${value.toFixed(2)}%</span><br/>`;
                });
                return result;
            }
        },
        legend: {
            type: 'scroll',
            orient: 'horizontal',
            left: 'center',
            bottom: 0,
            pageButtonPosition: 'end'
        },
        grid: {
            left: '3%',
            right: '4%',
            bottom: '15%',
            top: '10%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            boundaryGap: false,
            data: categories,
            axisLabel: {
                interval: Math.floor(categories.length / 8), // 8つ程度のラベルを表示
                rotate: 45
            }
        },
        yAxis: {
            type: 'value',
            name: '騰落率 (%)',
            axisLabel: {
                formatter: '{value}%'
            },
            splitLine: {
                lineStyle: {
                    type: 'dashed'
                }
            },
            axisLine: {
                show: true,
                lineStyle: {
                    color: '#999'
                }
            }
        },
        series: series,
        dataZoom: [
            {
                type: 'inside',
                start: 0,
                end: 100
            },
            {
                start: 0,
                end: 100,
                height: 30,
                bottom: 60
            }
        ]
    };

    performanceChart.setOption(option, true);
}

function getPeriodDays(period) {
    switch(period) {
        case '5d': return 5;
        case '2w': return 14;
        case '1m': return 30;
        case '1y': return 252; // 営業日ベース
        case 'ytd': return getDaysFromYearStart();
        default: return 30;
    }
}

function getDaysFromYearStart() {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const diffTime = Math.abs(now - yearStart);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function generateCategories(days) {
    const categories = [];
    const today = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        
        if (days <= 30) {
            categories.push(date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }));
        } else {
            categories.push(date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short' }));
        }
    }
    
    return categories;
}

function generatePerformanceData(days, stockIndex) {
    const data = [0]; // 開始日は0%
    let cumulative = 0;
    
    // 銘柄ごとに異なる傾向を持たせる
    const trend = (stockIndex % 3 - 1) * 0.02; // -0.02, 0, 0.02
    const volatility = 0.5 + (stockIndex % 5) * 0.3; // 0.5 - 2.0
    
    for (let i = 1; i < days; i++) {
        // ランダムウォーク + トレンド
        const dailyReturn = (Math.random() - 0.5) * volatility + trend;
        cumulative += dailyReturn;
        data.push(Number(cumulative.toFixed(2)));
    }
    
    return data;
}

async function fetchDashboardData(elements) {
    setLoadingState(elements, true);
    try {
        const url = `${API_ENDPOINT}?benchmark_ticker=${state.benchmark}&date=${state.targetDate}`;
        const response = await fetch(url);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `サーバーエラー: ${response.status}`);
        }
        state.dashboardData = await response.json();
        
        // 初期化：最新の日付を選択
        if (state.dashboardData.date_range && state.dashboardData.date_range.length > 0) {
            state.currentDateIndex = state.dashboardData.date_range.length - 1;
            setupTimeAxisSlider(elements);
        }

        // 表示セクターの初期化
        const latestDate = getCurrentDateString();
        if (state.visibleSectors.size === 0 && state.dashboardData.historical_data[latestDate]) {
            state.dashboardData.historical_data[latestDate].sectors.forEach(s => {
                state.visibleSectors.add(s.ticker);
            });
        }

        renderAll(elements);
    } catch (error) {
        console.error('データ取得に失敗:', error);
        alert(`データ取得に失敗しました: ${error.message}`);
    } finally {
        setLoadingState(elements, false);
    }
}

function setupTimeAxisSlider(elements) {
    if (elements.timeAxisSlider && state.dashboardData.date_range) {
        const dateRange = state.dashboardData.date_range;
        elements.timeAxisSlider.min = 0;
        elements.timeAxisSlider.max = dateRange.length - 1;
        elements.timeAxisSlider.value = state.currentDateIndex;
        
        // 日付ラベルの更新
        updateTimeAxisValue(elements);
    }
}

function updateTimeAxisValue(elements) {
    if (elements.timeAxisValue && state.dashboardData.date_range) {
        const currentDate = state.dashboardData.date_range[state.currentDateIndex];
        elements.timeAxisValue.textContent = currentDate;
    }
}

function getCurrentDateString() {
    if (state.dashboardData.date_range && state.dashboardData.date_range.length > 0) {
        return state.dashboardData.date_range[state.currentDateIndex];
    }
    return state.targetDate;
}

function getCurrentSectorData() {
    const currentDate = getCurrentDateString();
    return state.dashboardData.historical_data[currentDate]?.sectors || [];
}

function updateCurrentDisplay(elements) {
    updateTimeAxisValue(elements);
    renderRRGChart(elements);
    renderTables(elements);
}

function renderAll(elements) {
    if (elements.dateDisplay) {
        elements.dateDisplay.textContent = `基準日: ${getCurrentDateString()}`;
    }
    renderRRGChart(elements);
    renderTables(elements);
}

function renderRRGChart(elements) {
    if (!rrgChart) return;
    
    const allSectors = getCurrentSectorData();
    if (!allSectors || allSectors.length === 0) {
        rrgChart.clear();
        return;
    }

    // データの範囲を計算
    let maxAbsX = 5, maxAbsY = 5;
    allSectors.forEach(s => {
        maxAbsX = Math.max(maxAbsX, Math.abs(s.rs_ratio - 100));
        maxAbsY = Math.max(maxAbsY, Math.abs(s.rs_momentum - 100));
    });
    const xMax = 100 + maxAbsX * 1.15;
    const xMin = 100 - maxAbsX * 1.15;
    const yMax = 100 + maxAbsY * 1.15;
    const yMin = 100 - maxAbsY * 1.15;

    const visibleSectors = allSectors.filter(s => state.visibleSectors.has(s.ticker));
    const series = visibleSectors.flatMap((sector, i) => {
        const color = SERIES_COLORS[i % SERIES_COLORS.length];
        
        // 軌跡データを tailLength でフィルタリング
        const fullTail = sector.tail || [];
        const filteredTail = fullTail.slice(-state.tailLength);
        
        return [
            { 
                name: sector.name, 
                type: 'line', 
                data: filteredTail, 
                symbol: 'none', 
                lineStyle: { width: 2, color }, 
                tooltip: { show: false },
                z: 10
            },
            { 
                name: sector.name, 
                type: 'scatter', 
                data: [[sector.rs_ratio, sector.rs_momentum]], 
                symbolSize: 12, 
                itemStyle: { color }, 
                label: { 
                    show: true, 
                    formatter: sector.name, 
                    position: 'right', 
                    fontSize: 10 
                },
                z: 10
            }
        ];
    });

    const option = {
        tooltip: { 
            trigger: 'item',
            formatter: (params) => {
                if (params.value && params.value.length >= 2) {
                    return `<b>${params.name}</b><br/>RS-Ratio: ${params.value[0].toFixed(2)}<br/>RS-Momentum: ${params.value[1].toFixed(2)}`;
                }
                return `<b>${params.name}</b>`;
            }
        },
        grid: { left: '10%', right: '15%', bottom: '10%', top: '10%' },
        xAxis: { 
            type: 'value', 
            name: 'JdK RS-Ratio', 
            min: xMin, 
            max: xMax, 
            splitLine: { show: true, lineStyle: { type: 'dashed', color: '#ddd' } }, 
            axisLine: { onZero: false },
            splitNumber: 10
        },
        yAxis: { 
            type: 'value', 
            name: 'JdK RS-Momentum', 
            min: yMin, 
            max: yMax, 
            splitLine: { show: true, lineStyle: { type: 'dashed', color: '#ddd' } }, 
            axisLine: { onZero: false },
            splitNumber: 10
        },
        series: [
            // 背景の象限エリア
            {
                type: 'scatter',
                data: [],
                markArea: {
                    silent: true,
                    itemStyle: { opacity: 0.1 },
                    data: [
                        [{
                            xAxis: 100, 
                            yAxis: 100,
                            itemStyle: { color: 'rgba(76, 175, 80, 0.3)' }
                        }, {
                            xAxis: xMax, 
                            yAxis: yMax
                        }],
                        [{
                            xAxis: xMin, 
                            yAxis: 100,
                            itemStyle: { color: 'rgba(33, 150, 243, 0.3)' }
                        }, {
                            xAxis: 100, 
                            yAxis: yMax
                        }],
                        [{
                            xAxis: xMin, 
                            yAxis: yMin,
                            itemStyle: { color: 'rgba(244, 67, 54, 0.3)' }
                        }, {
                            xAxis: 100, 
                            yAxis: 100
                        }],
                        [{
                            xAxis: 100, 
                            yAxis: yMin,
                            itemStyle: { color: 'rgba(255, 193, 7, 0.3)' }
                        }, {
                            xAxis: xMax, 
                            yAxis: 100
                        }]
                    ]
                },
                markLine: {
                    silent: true,
                    symbol: 'none',
                    lineStyle: { type: 'solid', color: '#888', width: 2 },
                    data: [
                        { xAxis: 100 },
                        { yAxis: 100 }
                    ]
                },
                z: 1
            },
            ...series
        ],
        graphic: [
            {
                type: 'text',
                right: '16%',
                top: '11%',
                style: {
                    text: 'Leading',
                    fill: '#4CAF50',
                    font: 'bold 14px sans-serif'
                },
                z: 6
            },
            {
                type: 'text',
                left: '11%',
                top: '11%',
                style: {
                    text: 'Improving',
                    fill: '#2196F3',
                    font: 'bold 14px sans-serif'
                },
                z: 6
            },
            {
                type: 'text',
                left: '11%',
                bottom: '11%',
                style: {
                    text: 'Lagging',
                    fill: '#F44336',
                    font: 'bold 14px sans-serif'
                },
                z: 6
            },
            {
                type: 'text',
                right: '16%',
                bottom: '11%',
                style: {
                    text: 'Weakening',
                    fill: '#FF9800',
                    font: 'bold 14px sans-serif'
                },
                z: 6
            }
        ]
    };

    rrgChart.setOption(option, true);
}

function renderTables(elements) {
    const sectors = getCurrentSectorData();
    if (!sectors || !elements.fullDataTableBody || !elements.longCandidateTable || !elements.shortCandidateTable) return;

    const longCandidates = [];
    const shortCandidates = [];

    elements.fullDataTableBody.innerHTML = ''; 

    const quadrantColors = {
        'Leading': '#4CAF50', 'Improving': '#2196F3',
        'Weakening': '#FFC107', 'Lagging': '#F44336'
    };

    sectors.forEach(sector => {
        if (sector.quadrant === 'Leading' || sector.quadrant === 'Improving') {
            longCandidates.push(sector);
        } else if (sector.quadrant === 'Weakening' || sector.quadrant === 'Lagging') {
            shortCandidates.push(sector);
        }

        const quadrantColor = quadrantColors[sector.quadrant] || '#777';
        const changeClass = sector.change_pct >= 0 ? 'price-up' : 'price-down';
        const changeSign = sector.change_pct >= 0 ? '+' : '';
        const isChecked = state.visibleSectors.has(sector.ticker) ? 'checked' : '';
        
        const row = `
            <tr>
                <td><input type="checkbox" data-ticker="${sector.ticker}" ${isChecked}></td>
                <td>
                    <div class="sector-cell">
                        <span class="quadrant-indicator" style="background-color:${quadrantColor};"></span>
                        ${sector.name}
                    </div>
                </td>
                <td class="ticker-cell">${sector.ticker}</td>
                <td>${sector.price.toFixed(2)}</td>
                <td class="${changeClass}">${changeSign}${sector.change_pct.toFixed(2)}%</td>
                <td>${sector.rs_ratio.toFixed(2)}</td>
                <td>${sector.rs_momentum.toFixed(2)}</td>
            </tr>
        `;
        elements.fullDataTableBody.insertAdjacentHTML('beforeend', row);
    });

    longCandidates.sort((a, b) => b.rs_momentum - a.rs_momentum);
    elements.longCandidateTable.innerHTML = `
        <thead><tr><th>セクター名</th><th>象限</th></tr></thead>
        <tbody>
            ${longCandidates.map(s => `<tr><td>${s.name}</td><td>${s.quadrant}</td></tr>`).join('')}
        </tbody>
    `;

    shortCandidates.sort((a, b) => a.rs_momentum - b.rs_momentum);
    elements.shortCandidateTable.innerHTML = `
        <thead><tr><th>セクター名</th><th>象限</th></tr></thead>
        <tbody>
            ${shortCandidates.map(s => `<tr><td>${s.name}</td><td>${s.quadrant}</td></tr>`).join('')}
        </tbody>
    `;
}

function setLoadingState(elements, isLoading) {
    state.isLoading = isLoading;
    if (elements.dashboardContainer) {
        elements.dashboardContainer.style.opacity = isLoading ? '0.5' : '1';
        elements.dashboardContainer.style.pointerEvents = isLoading ? 'none' : 'auto';
    }

    if (isLoading) {
        rrgChart?.showLoading();
        performanceChart?.showLoading();
    } else {
        rrgChart?.hideLoading();
        performanceChart?.hideLoading();
    }
}

// エクスポート機能
function exportData(format) {
    if (!state.dashboardData.historical_data || !state.dashboardData.date_range) {
        alert('エクスポートするデータがありません。');
        return;
    }

    const exportData = prepareExportData();
    const filename = `sector_rrg_data_${state.benchmark}_${new Date().toISOString().split('T')[0]}`;

    if (format === 'csv') {
        downloadCSV(exportData, `${filename}.csv`);
    } else if (format === 'json') {
        downloadJSON(exportData, `${filename}.json`);
    }
}

function prepareExportData() {
    const flatData = [];
    
    state.dashboardData.date_range.forEach(date => {
        const dayData = state.dashboardData.historical_data[date];
        if (dayData && dayData.sectors) {
            dayData.sectors.forEach(sector => {
                flatData.push({
                    date: date,
                    benchmark: state.benchmark,
                    sector_name: sector.name,
                    sector_ticker: sector.ticker,
                    price: sector.price,
                    change_pct: sector.change_pct,
                    rs_ratio: sector.rs_ratio,
                    rs_momentum: sector.rs_momentum,
                    quadrant: sector.quadrant,
                    weekly_change_pct: sector.weekly_change_pct
                });
            });
        }
    });

    return flatData;
}

function downloadCSV(data, filename) {
    if (data.length === 0) return;

    // CSVヘッダー
    const headers = Object.keys(data[0]);
    const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(header => {
            const value = row[header];
            // 数値以外はクォートで囲む
            return typeof value === 'string' ? `"${value}"` : value;
        }).join(','))
    ].join('\n');

    downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
}

function downloadJSON(data, filename) {
    const jsonContent = JSON.stringify({
        metadata: {
            export_date: new Date().toISOString(),
            benchmark: state.benchmark,
            date_range: {
                start: state.dashboardData.date_range[0],
                end: state.dashboardData.date_range[state.dashboardData.date_range.length - 1]
            },
            total_records: data.length
        },
        data: data
    }, null, 2);

    downloadFile(jsonContent, filename, 'application/json;charset=utf-8;');
}

function downloadFile(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = window.URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    window.URL.revokeObjectURL(url);
}

// ユーティリティ関数群
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

// パフォーマンス監視
function logPerformance(label, fn) {
    console.time(label);
    const result = fn();
    console.timeEnd(label);
    return result;
}

// エラーハンドリング
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    // 本番環境では外部サービスにエラーを送信
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    // 本番環境では外部サービスにエラーを送信
    event.preventDefault();
});

// DOM準備完了の確認
function domReady(fn) {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(fn, 1);
    } else {
        document.addEventListener('DOMContentLoaded', fn);
    }
}

// ローカルストレージ管理（設定保存用）
const LocalStorage = {
    set: (key, value) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.warn('LocalStorage set failed:', e);
        }
    },
    
    get: (key, defaultValue = null) => {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (e) {
            console.warn('LocalStorage get failed:', e);
            return defaultValue;
        }
    },
    
    remove: (key) => {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.warn('LocalStorage remove failed:', e);
        }
    }
};

// 設定の永続化
function saveSettings() {
    LocalStorage.set('dashboardSettings', {
        benchmark: state.benchmark,
        tailLength: state.tailLength,
        selectedSector: state.selectedSector,
        selectedPeriod: state.selectedPeriod,
        activeTab: state.activeTab
    });
}

function loadSettings() {
    const settings = LocalStorage.get('dashboardSettings');
    if (settings) {
        state.benchmark = settings.benchmark || state.benchmark;
        state.tailLength = settings.tailLength || state.tailLength;
        state.selectedSector = settings.selectedSector || state.selectedSector;
        state.selectedPeriod = settings.selectedPeriod || state.selectedPeriod;
        state.activeTab = settings.activeTab || state.activeTab;
    }
}

// アプリケーション終了時の処理
window.addEventListener('beforeunload', () => {
    saveSettings();
});

// デバッグ用の関数（開発時のみ）
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.debugDashboard = {
        state,
        rrgChart,
        performanceChart,
        exportData: () => exportData('json'),
        clearData: () => {
            state.dashboardData = { benchmark_ohlc: [], historical_data: {}, date_range: [] };
            state.visibleSectors.clear();
        }
    };
    
    console.log('デバッグモード有効: window.debugDashboard でアクセス可能');
}

// ファイルの最後に以下の2つの関数を追加
function selectAllCheckboxes(elements) {
    const checkboxes = elements.fullDataTableBody.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        if (!checkbox.checked) {
            checkbox.checked = true;
            const ticker = checkbox.dataset.ticker;
            state.visibleSectors.add(ticker);
        }
    });
    renderRRGChart(elements);
    
    // 視覚的フィードバック
    elements.selectAllBtn.style.transform = 'scale(0.95)';
    setTimeout(() => {
        elements.selectAllBtn.style.transform = 'scale(1)';
    }, 150);
}

function clearAllCheckboxes(elements) {
    const checkboxes = elements.fullDataTableBody.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        if (checkbox.checked) {
            checkbox.checked = false;
            const ticker = checkbox.dataset.ticker;
            state.visibleSectors.delete(ticker);
        }
    });
    renderRRGChart(elements);
    
    // 視覚的フィードバック
    elements.clearAllBtn.style.transform = 'scale(0.95)';
    setTimeout(() => {
        elements.clearAllBtn.style.transform = 'scale(1)';
    }, 150);
}
