/**
 * Interactive Sector Rotation Dashboard
 * Final Professional Version
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
    dashboardData: { benchmark_ohlc: [], sectors: [] },
    visibleSectors: new Set(),
    isLoading: true,
};

// --- チャートインスタンス ---
let rrgChart = null;
let dateSliderChart = null;

// --- DOM読み込み完了後にアプリケーションを初期化 ---
document.addEventListener('DOMContentLoaded', () => {
    const elements = {
        benchmarkSelect: document.getElementById('benchmark-select'),
        dateDisplay: document.getElementById('date-display'),
        rrgChartContainer: document.getElementById('rrg-chart'),
        dateSliderContainer: document.getElementById('date-slider-container'),
        longCandidateTable: document.getElementById('long-candidate-table'),
        shortCandidateTable: document.getElementById('short-candidate-table'),
        fullDataTableBody: document.getElementById('full-data-table-body'),
        dashboardContainer: document.querySelector('.dashboard-container'),
        resetZoomBtn: document.getElementById('reset-zoom-btn'),
    };

    initializeBenchmarkSelector(elements);
    initializeCharts(elements);
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
    dateSliderChart = echarts.init(elements.dateSliderContainer);

    window.addEventListener('resize', () => {
        rrgChart?.resize();
        dateSliderChart?.resize();
    });
}

function addEventListeners(elements) {
    elements.benchmarkSelect.addEventListener('change', (e) => {
        state.benchmark = e.target.value;
        state.visibleSectors.clear(); 
        fetchDashboardData(elements);
    });

    dateSliderChart.on('datazoom', (params) => {
        const ohlc = state.dashboardData.benchmark_ohlc;
        if (!ohlc || ohlc.length === 0 || state.isLoading) return;

        const endPercent = params.batch ? params.batch[0].end : params.end;
        const endIndex = Math.floor(ohlc.length * (endPercent / 100));
        
        const selectedDate = ohlc[Math.min(endIndex, ohlc.length - 1)]?.date;

        if (selectedDate && selectedDate !== state.targetDate) {
            state.targetDate = selectedDate;
            fetchDashboardData(elements);
        }
    });

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
        
        if (state.visibleSectors.size === 0 && state.dashboardData.sectors) {
            state.dashboardData.sectors.forEach(s => state.visibleSectors.add(s.ticker));
        }

        renderAll(elements);
    } catch (error) {
        console.error('データ取得に失敗:', error);
        alert(`データ取得に失敗しました: ${error.message}`);
    } finally {
        setLoadingState(elements, false);
    }
}

function renderAll(elements) {
    elements.dateDisplay.textContent = `基準日: ${state.targetDate}`;
    renderDateSliderChart(elements);
    renderRRGChart(elements);
    renderTables(elements);
}

function renderDateSliderChart(elements) {
    const ohlcData = state.dashboardData.benchmark_ohlc;
    if (!ohlcData) return;
    
    const dates = ohlcData.map(item => item.date);
    const closePrices = ohlcData.map(item => item.close);

    const option = {
        grid: { left: '3%', right: '4%', top: '10%', bottom: '25%' },
        xAxis: { type: 'category', data: dates, boundaryGap: false, axisLine: { onZero: false }, axisLabel: { show: false }, axisTick: { show: false } },
        yAxis: { type: 'value', show: false },
        dataZoom: [
            { type: 'slider', xAxisIndex: 0, start: 80, end: 100, height: 25, bottom: '5%' },
            { type: 'inside', xAxisIndex: 0 }
        ],
        series: [{
            type: 'line', data: closePrices, symbol: 'none',
            lineStyle: { color: '#0056b3', width: 1.5 },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{
                    offset: 0, color: 'rgba(0, 86, 179, 0.4)'
                }, {
                    offset: 1, color: 'rgba(0, 86, 179, 0.1)'
                }])
            }
        }]
    };
    dateSliderChart.setOption(option, true);
}

function renderRRGChart(elements) {
    const allSectors = state.dashboardData.sectors;
    if (!allSectors || allSectors.length === 0) {
        rrgChart.clear();
        return;
    }

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
        return [
            { name: sector.name, type: 'line', data: sector.tail, symbol: 'none', lineStyle: { width: 2, color }, tooltip: { show: false } },
            { name: sector.name, type: 'scatter', data: [[sector.rs_ratio, sector.rs_momentum]], symbolSize: 12, itemStyle: { color }, label: { show: true, formatter: sector.name, position: 'right', fontSize: 10 } }
        ];
    });

    const option = {
        tooltip: { 
            trigger: 'item',
            formatter: (params) => `<b>${params.name}</b><br/>RS-Ratio: ${params.value[0].toFixed(2)}<br/>RS-Momentum: ${params.value[1].toFixed(2)}`
        },
        grid: { left: '10%', right: '15%', bottom: '10%', top: '10%' },
        xAxis: { type: 'value', name: 'JdK RS-Ratio', min: xMin, max: xMax, splitLine: { show: true, lineStyle: { type: 'dashed', color: '#ddd' } }, axisLine: { onZero: false } },
        yAxis: { 
            type: 'value', name: 'JdK RS-Momentum', min: yMin, max: yMax, splitLine: { show: true, lineStyle: { type: 'dashed', color: '#ddd' } }, axisLine: { onZero: false },
            markArea: {
                silent: true,
                data: [
                    [{ xAxis: 100, yAxis: 100, itemStyle: { color: 'rgba(204, 235, 204, 0.3)'} }, { xAxis: 'max', yAxis: 'max' }],
                    [{ xAxis: 'min', yAxis: 100, itemStyle: { color: 'rgba(204, 229, 255, 0.3)'} }, { xAxis: 100, yAxis: 'max' }],
                    [{ xAxis: 'min', yAxis: 'min', itemStyle: { color: 'rgba(255, 204, 204, 0.3)'} }, { xAxis: 100, yAxis: 100 }],
                    [{ xAxis: 100, yAxis: 'min', itemStyle: { color: 'rgba(255, 255, 204, 0.3)'} }, { xAxis: 'max', yAxis: 100 }]
                ]
            },
            markLine: { silent: true, symbol: 'none', lineStyle: { type: 'solid', color: '#888' }, data: [{ xAxis: 100 }, { yAxis: 100 }] }
        },
        graphic: {
            elements: [
                { type: 'text', right: '16%', top: '11%', style: { text: 'Leading', fill: 'green', font: 'bold 14px sans-serif' } },
                { type: 'text', left: '11%', top: '11%', style: { text: 'Improving', fill: 'blue', font: 'bold 14px sans-serif' } },
                { type: 'text', left: '11%', bottom: '11%', style: { text: 'Lagging', fill: 'red', font: 'bold 14px sans-serif' } },
                { type: 'text', right: '16%', bottom: '11%', style: { text: 'Weakening', fill: '#b45f06', font: 'bold 14px sans-serif' } },
            ]
        },
        dataZoom: [
            { type: 'inside', moveOnMouseMove: true, xAxisIndex: 0, yAxisIndex: 0 },
            { type: 'slider', show: false }
        ],
        series: series
    };
    rrgChart.setOption(option, true);
}

function renderTables(elements) {
    const { sectors } = state.dashboardData;
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
        dateSliderChart?.showLoading();
    } else {
        rrgChart?.hideLoading();
        dateSliderChart?.hideLoading();
    }
}