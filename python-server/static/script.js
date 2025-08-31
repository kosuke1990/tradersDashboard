/**
 * Enhanced Interactive Sector Rotation Dashboard
 * With Time-axis and Tail-length Sliders
 */

// --- グローバル設定 ---
const API_ENDPOINT = '/calculate';
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
    // 新しい状態
    currentDateIndex: 0,
    tailLength: 5,
};

// --- チャートインスタンス ---
let rrgChart = null;

// --- DOM読み込み完了後にアプリケーションを初期化 ---
document.addEventListener('DOMContentLoaded', () => {
    const elements = {
        benchmarkSelect: document.getElementById('benchmark-select'),
        dateDisplay: document.getElementById('date-display'),
        rrgChartContainer: document.getElementById('rrg-chart'),
        longCandidateTable: document.getElementById('long-candidate-table'),
        shortCandidateTable: document.getElementById('short-candidate-table'),
        fullDataTableBody: document.getElementById('full-data-table-body'),
        dashboardContainer: document.querySelector('.dashboard-container'),
        resetZoomBtn: document.getElementById('reset-zoom-btn'),
        // 新しい要素
        timeAxisSlider: document.getElementById('time-axis-slider'),
        tailLengthSlider: document.getElementById('tail-length-slider'),
        timeAxisValue: document.getElementById('time-axis-value'),
        tailLengthValue: document.getElementById('tail-length-value'),
        exportCsvBtn: document.getElementById('export-csv-btn'),
        exportJsonBtn: document.getElementById('export-json-btn'),
    };

    initializeBenchmarkSelector(elements);
    initializeCharts(elements);
    initializeSliders(elements);
    addEventListeners(elements);
    fetchDashboardData(elements);
});

function initializeBenchmarkSelector(elements) {
    const select = elements.benchmarkSelect;
    Object.entries(BENCHMARKS).forEach(([ticker, name]) => {
        const option = new Option(`${name} (${ticker})`, ticker);
        select.appendChild(option);
    });
    select.value = state.benchmark;
}

function initializeCharts(elements) {
    rrgChart = echarts.init(elements.rrgChartContainer);

    window.addEventListener('resize', () => {
        rrgChart?.resize();
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
        elements.tailLengthValue.textContent = `${state.tailLength}日`;
        
        elements.tailLengthSlider.addEventListener('input', (e) => {
            state.tailLength = parseInt(e.target.value);
            elements.tailLengthValue.textContent = `${state.tailLength}日`;
            renderRRGChart(elements); // RRGチャートのみ再描画
        });
    }
}

function addEventListeners(elements) {
    elements.benchmarkSelect.addEventListener('change', (e) => {
        state.benchmark = e.target.value;
        state.visibleSectors.clear(); 
        fetchDashboardData(elements);
    });

    // 従来の日付スライダーは無効化
    // dateSliderChart.on('datazoom', (params) => {
    //     // コメントアウト
    // });

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

    elements.resetZoomBtn.addEventListener('click', () => {
        rrgChart?.dispatchAction({ type: 'restore' });
    });

    // エクスポート機能のイベントリスナー
    elements.exportCsvBtn.addEventListener('click', () => {
        exportData('csv');
    });

    elements.exportJsonBtn.addEventListener('click', () => {
        exportData('json');
    });
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
    elements.dateDisplay.textContent = `基準日: ${getCurrentDateString()}`;
    renderRRGChart(elements);
    renderTables(elements);
}

function renderRRGChart(elements) {
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
    if (!sectors) return;

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
    elements.dashboardContainer.style.opacity = isLoading ? '0.5' : '1';
    elements.dashboardContainer.style.pointerEvents = isLoading ? 'none' : 'auto';

    if (isLoading) {
        rrgChart?.showLoading();
    } else {
        rrgChart?.hideLoading();
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