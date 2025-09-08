/**
 * Enhanced Interactive Sector Rotation Dashboard
 * With Tab Navigation and Constituent Analysis
 */

// --- グローバル設定 ---
const API_ENDPOINT = '/calculate';
const CONSTITUENTS_ENDPOINT = '/constituents';
const SECTOR_LIST_ENDPOINT = '/sector_list';
const BENCHMARKS = {
    '1306.T': 'TOPIX ETF',
    '1321.T': '日経225 ETF'
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
    currentDateIndex: 0,
    tailLength: 5,
    // 構成銘柄分析用の状態
    activeTab: 'rrg-tab',
    selectedSector: null,
    sectorList: [],
    constituentsData: null,
    analysisPeriod: '5d'
};

// --- チャートインスタンス ---
let rrgChart = null;
let constituentsChart = null;

// DOM読み込み完了後にアプリケーションを初期化
document.addEventListener('DOMContentLoaded', () => {
    const elements = {
        // 既存の要素
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
        
        // 新しいタブ関連要素
        tabButtons: document.querySelectorAll('.tab-button'),
        tabContents: document.querySelectorAll('.tab-content'),
        
        // 構成銘柄分析用要素
        sectorButtons: document.getElementById('sector-buttons'),
        periodSelect: document.getElementById('period-select'),
        sortSelect: document.getElementById('sort-select'),
        constituentsChartContainer: document.getElementById('constituents-chart'),
        selectedSectorTitle: document.getElementById('selected-sector-title'),
        chartStats: document.getElementById('chart-stats'),
        avgChange: document.getElementById('avg-change'),
        maxChange: document.getElementById('max-change'),
        minChange: document.getElementById('min-change'),
        constituentsTableBody: document.getElementById('constituents-table-body')
    };

    console.log('Elements found:', Object.keys(elements).map(key => ({
        [key]: !!elements[key]
    })));

    initializeBenchmarkSelector(elements);
    initializeCharts(elements);
    initializeSliders(elements);
    initializeTabs(elements);
    addEventListeners(elements);
    fetchDashboardData(elements);
    fetchSectorList(elements);
});

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
    // RRGチャート
    if (elements.rrgChartContainer) {
        rrgChart = echarts.init(elements.rrgChartContainer);
    }
    
    // 構成銘柄チャート
    if (elements.constituentsChartContainer) {
        constituentsChart = echarts.init(elements.constituentsChartContainer);
    }

    window.addEventListener('resize', () => {
        rrgChart?.resize();
        constituentsChart?.resize();
    });
}

function initializeSliders(elements) {
    // 時間軸スライダーの初期化
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
            if (state.activeTab === 'rrg-tab') {
                renderRRGChart(elements);
            }
        });
    }
}

function initializeTabs(elements) {
    // タブボタンのクリックイベント
    elements.tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;
            switchTab(targetTab, elements);
        });
    });
    
    // 分析期間選択
    if (elements.periodSelect) {
        elements.periodSelect.value = state.analysisPeriod;
        elements.periodSelect.addEventListener('change', (e) => {
            state.analysisPeriod = e.target.value;
            if (state.selectedSector) {
                fetchConstituentsData(state.selectedSector, elements);
            }
        });
    }
    
    // ソート選択
    if (elements.sortSelect) {
        elements.sortSelect.addEventListener('change', () => {
            renderConstituentsTable(elements);
        });
    }
}

function switchTab(tabId, elements) {
    // タブボタンの状態更新
    elements.tabButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    
    // タブコンテンツの表示切り替え
    elements.tabContents.forEach(content => {
        content.classList.toggle('active', content.id === tabId);
    });
    
    state.activeTab = tabId;
    
    // チャートのリサイズ
    setTimeout(() => {
        if (tabId === 'rrg-tab') {
            rrgChart?.resize();
        } else if (tabId === 'constituents-tab') {
            constituentsChart?.resize();
        }
    }, 100);
}

async function fetchSectorList(elements) {
    try {
        const response = await fetch(SECTOR_LIST_ENDPOINT);
        if (!response.ok) throw new Error(`サーバーエラー: ${response.status}`);
        
        const data = await response.json();
        state.sectorList = data.sectors;
        renderSectorButtons(elements);
    } catch (error) {
        console.error('セクターリスト取得に失敗:', error);
    }
}

function renderSectorButtons(elements) {
    if (!elements.sectorButtons || !state.sectorList) return;
    
    elements.sectorButtons.innerHTML = '';
    
    state.sectorList.forEach(sector => {
        if (sector.has_constituents) {
            const button = document.createElement('button');
            button.className = 'sector-button';
            button.textContent = sector.name;
            button.dataset.ticker = sector.ticker;
            
            button.addEventListener('click', () => {
                // 既存の選択を解除
                elements.sectorButtons.querySelectorAll('.sector-button').forEach(btn => {
                    btn.classList.remove('active');
                });
                
                // 新しい選択
                button.classList.add('active');
                state.selectedSector = sector.ticker;
                fetchConstituentsData(sector.ticker, elements);
            });
            
            elements.sectorButtons.appendChild(button);
        }
    });
}

async function fetchConstituentsData(sectorTicker, elements) {
    if (!sectorTicker) return;
    
    setLoadingState(elements, true);
    
    try {
        const url = `${CONSTITUENTS_ENDPOINT}?sector_ticker=${sectorTicker}&period=${state.analysisPeriod}`;
        const response = await fetch(url);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `サーバーエラー: ${response.status}`);
        }
        
        state.constituentsData = await response.json();
        renderConstituentsAnalysis(elements);
    } catch (error) {
        console.error('構成銘柄データ取得に失敗:', error);
        alert(`データ取得に失敗しました: ${error.message}`);
    } finally {
        setLoadingState(elements, false);
    }
}

function renderConstituentsAnalysis(elements) {
    if (!state.constituentsData) return;
    
    // タイトル更新
    if (elements.selectedSectorTitle) {
        elements.selectedSectorTitle.textContent = `${state.constituentsData.sector_name} 構成銘柄分析`;
    }
    
    // 統計情報更新
    if (elements.chartStats) {
        elements.chartStats.style.display = 'flex';
        if (elements.avgChange) elements.avgChange.textContent = state.constituentsData.stats.avg_change;
        if (elements.maxChange) elements.maxChange.textContent = state.constituentsData.stats.max_change;
        if (elements.minChange) elements.minChange.textContent = state.constituentsData.stats.min_change;
    }
    
    renderConstituentsChart(elements);
    renderConstituentsTable(elements);
}

function renderConstituentsChart(elements) {
    if (!constituentsChart || !state.constituentsData) return;
    
    const data = state.constituentsData.constituents;
    
    // 騰落率でソート
    const sortedData = [...data].sort((a, b) => b.change_pct - a.change_pct);
    
    const names = sortedData.map(d => d.name);
    const changes = sortedData.map(d => d.change_pct);
    
    // 期間表示名を取得（APIから返される場合はそれを使用、なければperiodをそのまま使用）
    const periodDisplay = state.constituentsData.period_display || state.constituentsData.period;
    
    const option = {
        title: {
            text: `騰落率ランキング (${periodDisplay})`,
            left: 'center',
            textStyle: { fontSize: 16, color: '#0056b3' }
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter: function(params) {
                const param = params[0];
                const ticker = sortedData[param.dataIndex].ticker;
                const price = sortedData[param.dataIndex].price;
                return `<b>${param.name}</b><br/>
                        ティッカー: ${ticker}<br/>
                        現在価格: ¥${price.toLocaleString()}<br/>
                        騰落率 (${periodDisplay}): ${param.value.toFixed(2)}%`;
            }
        },
        grid: {
            left: '3%',
            right: '4%',
            bottom: '15%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            data: names,
            axisLabel: {
                rotate: 45,
                fontSize: 10,
                interval: 0
            }
        },
        yAxis: {
            type: 'value',
            name: '騰落率 (%)',
            axisLabel: {
                formatter: '{value}%'
            }
        },
        series: [{
            name: '騰落率',
            type: 'bar',
            data: changes,
            itemStyle: {
                color: function(params) {
                    // 年初来・1年の場合は色分けをより明確に
                    if (state.constituentsData.period === 'ytd' || state.constituentsData.period === '1y') {
                        if (params.value >= 10) return '#00C851'; // 大幅上昇：明るい緑
                        if (params.value >= 0) return '#26A69A';  // 上昇：緑
                        if (params.value >= -10) return '#EF5350'; // 下落：赤
                        return '#D32F2F'; // 大幅下落：暗い赤
                    }
                    // 短期間の場合は従来通り
                    return params.value >= 0 ? '#26A69A' : '#EF5350';
                }
            },
            label: {
                show: true,
                position: function(params) {
                    // 値が負の場合は下に、正の場合は上に表示
                    return params.value >= 0 ? 'top' : 'bottom';
                },
                formatter: '{c}%',
                fontSize: 10
            }
        }]
    };
    
    constituentsChart.setOption(option, true);
}

function renderConstituentsTable(elements) {
    if (!elements.constituentsTableBody || !state.constituentsData) return;
    
    const data = [...state.constituentsData.constituents];
    const sortType = elements.sortSelect ? elements.sortSelect.value : 'change_desc';
    
    // ソート処理
    switch (sortType) {
        case 'change_desc':
            data.sort((a, b) => b.change_pct - a.change_pct);
            break;
        case 'change_asc':
            data.sort((a, b) => a.change_pct - b.change_pct);
            break;
        case 'name_asc':
            data.sort((a, b) => a.name.localeCompare(b.name));
            break;
    }
    
    elements.constituentsTableBody.innerHTML = '';
    
    data.forEach(constituent => {
        const changeClass = constituent.change_pct >= 0 ? 'price-positive' : 'price-negative';
        const changeSign = constituent.change_pct >= 0 ? '+' : '';
        
        const row = `
            <tr>
                <td>${constituent.ticker}</td>
                <td>${constituent.name}</td>
                <td>¥${constituent.price.toLocaleString()}</td>
                <td class="${changeClass}">${changeSign}${constituent.change_pct.toFixed(2)}%</td>
                <td>${constituent.volume.toLocaleString()}</td>
            </tr>
        `;
        elements.constituentsTableBody.insertAdjacentHTML('beforeend', row);
    });
}

// イベントリスナーの追加（既存機能を保持）
function addEventListeners(elements) {
    // 既存のイベントリスナー
    if (elements.benchmarkSelect) {
        elements.benchmarkSelect.addEventListener('change', (e) => {
            state.benchmark = e.target.value;
            state.visibleSectors.clear(); 
            fetchDashboardData(elements);
        });
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
                if (state.activeTab === 'rrg-tab') {
                    renderRRGChart(elements);
                }
            }
        });
    }

    if (elements.resetZoomBtn) {
        elements.resetZoomBtn.addEventListener('click', () => {
            rrgChart?.dispatchAction({ type: 'restore' });
        });
    }

    // ケバブメニューのイベントリスナー
    if (elements.exportMenuBtn && elements.exportDropdown) {
        elements.exportMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            elements.exportDropdown.classList.toggle('show');
        });
        
        elements.exportDropdown.addEventListener('click', (e) => {
            const item = e.target.closest('.export-dropdown-item');
            if (item) {
                const format = item.dataset.format;
                exportData(format);
                elements.exportDropdown.classList.remove('show');
            }
        });
        
        document.addEventListener('click', () => {
            elements.exportDropdown.classList.remove('show');
        });
    }
}

// 既存の関数群（RRG分析関連）
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
        
        if (state.dashboardData.date_range && state.dashboardData.date_range.length > 0) {
            state.currentDateIndex = state.dashboardData.date_range.length - 1;
            setupTimeAxisSlider(elements);
        }

        const latestDate = getCurrentDateString();
        if (state.visibleSectors.size === 0 && state.dashboardData.historical_data[latestDate]) {
            state.dashboardData.historical_data[latestDate].sectors.forEach(s => {
                state.visibleSectors.add(s.ticker);
            });
        }

        if (state.activeTab === 'rrg-tab') {
            renderAll(elements);
        }
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
    if (state.activeTab === 'rrg-tab') {
        renderRRGChart(elements);
        renderTables(elements);
    }
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
        constituentsChart?.showLoading();
    } else {
        rrgChart?.hideLoading();
        constituentsChart?.hideLoading();
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

    const headers = Object.keys(data[0]);
    const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(header => {
            const value = row[header];
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