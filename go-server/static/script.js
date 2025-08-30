// --- グローバル変数 ---
let rrgChart = null;
let fullRrgData = [];
let tickers = [];
const TAIL_LENGTH = 5;

// --- DOM要素 ---
const benchmarkSelect = document.getElementById('benchmark-select');
const dateSlider = document.getElementById('date-slider');
const dateDisplay = document.getElementById('date-display');
const dataTableBody = document.getElementById('data-table-body');
const chartCanvas = document.getElementById('rrgChart');
const resetZoomBtn = document.getElementById('reset-zoom-btn');

// --- 初期化処理 ---
// HTMLのDOMと、deferで読み込んだスクリプトが全て準備完了してから実行する
document.addEventListener('DOMContentLoaded', async () => {
    // deferで読み込まれたスクリプトはグローバルスコープで利用可能になるため、
    // ここで手動登録を行うのが最も確実
    Chart.register(ChartAnnotation, ChartZoom, ChartDataLabels);

    await initializeSelectors();
    
    benchmarkSelect.addEventListener('change', handleDataReload);
    dateSlider.addEventListener('input', updateUIForDate);
    resetZoomBtn.addEventListener('click', () => rrgChart?.resetZoom());

    initializeChart();
    await handleDataReload();
});


// --- 主要な関数 ---

async function initializeSelectors() {
    try {
        const response = await fetch('/api/tickers');
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        tickers = await response.json();

        benchmarkSelect.innerHTML = '';
        tickers.forEach(ticker => {
            const option = new Option(`${ticker.name} (${ticker.ticker})`, ticker.ticker);
            benchmarkSelect.appendChild(option);
        });
        
        const defaultBenchmark = "1306.T"; // TOPIX ETF
        if (tickers.some(t => t.ticker === defaultBenchmark)) {
            benchmarkSelect.value = defaultBenchmark;
        }
    } catch (error) {
        console.error('Failed to load tickers:', error);
        benchmarkSelect.innerHTML = '<option>銘柄読込失敗</option>';
    }
}

async function handleDataReload() {
    const selectedBenchmark = benchmarkSelect.value;
    if (!selectedBenchmark) return;

    setLoadingState(true);

    try {
        const response = await fetch(`/api/calculate?benchmark_ticker=${selectedBenchmark}`);
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        fullRrgData = await response.json();

        if (fullRrgData && fullRrgData.length > 0) {
            const { xMin, xMax, yMin, yMax } = calculateSymmetricalScale(fullRrgData);
            updateChartScalesAndAnnotations(xMin, xMax, yMin, yMax);
            
            if(rrgChart) rrgChart.resetZoom();

            dateSlider.max = fullRrgData.length - 1;
            dateSlider.value = fullRrgData.length - 1;
            
            updateUIForDate();
        } else {
            setErrorState('表示できるデータがありません。');
        }
    } catch (error) {
        console.error('Failed to fetch RRG data:', error);
        setErrorState('データの取得に失敗しました。');
    } finally {
        setLoadingState(false);
    }
}

function updateUIForDate() {
    const sliderIndex = parseInt(dateSlider.value, 10);
    if (!fullRrgData[sliderIndex]) return;

    const selectedDateData = fullRrgData[sliderIndex];
    dateDisplay.textContent = selectedDateData.date;
    
    rrgChart.data.datasets = createChartDatasets(sliderIndex);
    rrgChart.update('none');

    updateDataTable(selectedDateData.points);
}

function initializeChart() {
    const ctx = chartCanvas.getContext('2d');
    rrgChart = new Chart(ctx, {
        type: 'scatter',
        data: { datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    grid: { color: '#e0e0e0' },
                    title: { display: true, text: 'JdK RS-Ratio' }
                },
                y: {
                    type: 'linear',
                    grid: { color: '#e0e0e0' },
                    title: { display: true, text: 'JdK RS-Momentum' }
                }
            },
            plugins: {
                title: { display: false },
                legend: { display: false },
                datalabels: {
                    display: true,
                    align: 'right',
                    offset: 8,
                    color: '#000',
                    font: { size: 10, weight: '500' },
                    formatter: (value, context) => context.chart.data.datasets[context.datasetIndex].label
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const tickerInfo = tickers.find(t => t.ticker === context.dataset.label);
                            const name = tickerInfo ? tickerInfo.name : context.dataset.label;
                            return `${name}: (Ratio: ${context.parsed.x.toFixed(2)}, Mom: ${context.parsed.y.toFixed(2)})`;
                        }
                    }
                },
                zoom: {
                    pan: { enabled: true, mode: 'xy' },
                    zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' }
                },
                annotation: {
                    annotations: {
                        // 背景色のボックス
                        leadingBox:   { type: 'box', backgroundColor: 'rgba(204, 235, 204, 0.7)', borderColor: 'transparent', drawTime: 'beforeDatasets' },
                        improvingBox: { type: 'box', backgroundColor: 'rgba(204, 229, 255, 0.7)', borderColor: 'transparent', drawTime: 'beforeDatasets' },
                        laggingBox:   { type: 'box', backgroundColor: 'rgba(255, 204, 204, 0.7)', borderColor: 'transparent', drawTime: 'beforeDatasets' },
                        weakeningBox: { type: 'box', backgroundColor: 'rgba(255, 255, 204, 0.7)', borderColor: 'transparent', drawTime: 'beforeDatasets' },
                        
                        lineX: { type: 'line', xMin: 100, xMax: 100, borderColor: '#555', borderWidth: 1.5 },
                        lineY: { type: 'line', yMin: 100, yMax: 100, borderColor: '#555', borderWidth: 1.5 },

                        labelLeading:   { type: 'label', content: 'Leading',   color: 'green',  font: {size: 14, weight: 'bold'}},
                        labelWeakening: { type: 'label', content: 'Weakening', color: '#b45f06', font: {size: 14, weight: 'bold'}},
                        labelLagging:   { type: 'label', content: 'Lagging',   color: 'red',    font: {size: 14, weight: 'bold'}},
                        labelImproving: { type: 'label', content: 'Improving', color: 'blue',   font: {size: 14, weight: 'bold'}}
                    }
                }
            },
        }
    });
}


// --- ヘルパー関数 ---

function createChartDatasets(sliderIndex) {
    const colors = ['#e6194B', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#bcf60c', '#008080', '#e6beff', '#9A6324', '#800000', '#aaffc3', '#808000', '#000075'];
    const datasets = [];
    const currentPoints = fullRrgData[sliderIndex].points;

    currentPoints.forEach((point, i) => {
        const color = colors[i % colors.length];
        const tailData = [];
        const startIndex = Math.max(0, sliderIndex - TAIL_LENGTH + 1);

        for (let j = startIndex; j <= sliderIndex; j++) {
            const pointForDay = fullRrgData[j].points.find(p => p.symbol === point.symbol);
            if (pointForDay) {
                tailData.push({ x: pointForDay.rs_ratio, y: pointForDay.rs_momentum });
            }
        }
        
        datasets.push({ type: 'line', data: tailData, borderColor: color, borderWidth: 2, pointRadius: 0, datalabels: { display: false } });
        datasets.push({ type: 'scatter', label: point.symbol, data: [{ x: point.rs_ratio, y: point.rs_momentum }], backgroundColor: color, pointRadius: 5, pointHoverRadius: 7 });
    });
    return datasets;
}

function calculateSymmetricalScale(data) {
    let maxAbsXDev = 0, maxAbsYDev = 0;
    data.forEach(datePoint => datePoint.points.forEach(p => {
        if (isFinite(p.rs_ratio)) maxAbsXDev = Math.max(maxAbsXDev, Math.abs(p.rs_ratio - 100));
        if (isFinite(p.rs_momentum)) maxAbsYDev = Math.max(maxAbsYDev, Math.abs(p.rs_momentum - 100));
    }));
    const xPadding = maxAbsXDev * 0.2 || 5;
    const yPadding = maxAbsYDev * 0.2 || 5;
    return {
        xMin: 100 - maxAbsXDev - xPadding, xMax: 100 + maxAbsXDev + xPadding,
        yMin: 100 - maxAbsYDev - yPadding, yMax: 100 + maxAbsYDev + yPadding,
    };
}

function updateChartScalesAndAnnotations(xMin, xMax, yMin, yMax) {
    if (!rrgChart) return;
    const { scales, plugins } = rrgChart.options;
    scales.x.min = xMin; scales.x.max = xMax;
    scales.y.min = yMin; scales.y.max = yMax;
    
    const { annotations } = plugins.annotation;
    annotations.leadingBox.xMin = 100; annotations.leadingBox.xMax = xMax;
    annotations.leadingBox.yMin = 100; annotations.leadingBox.yMax = yMax;
    
    annotations.improvingBox.xMin = xMin; annotations.improvingBox.xMax = 100;
    annotations.improvingBox.yMin = 100; annotations.improvingBox.yMax = yMax;

    annotations.laggingBox.xMin = xMin; annotations.laggingBox.xMax = 100;
    annotations.laggingBox.yMin = yMin; annotations.laggingBox.yMax = 100;
    
    annotations.weakeningBox.xMin = 100; annotations.weakeningBox.xMax = xMax;
    annotations.weakeningBox.yMin = yMin; annotations.weakeningBox.yMax = 100;

    annotations.labelLeading.xValue = xMax;   annotations.labelLeading.yValue = yMax;
    annotations.labelWeakening.xValue = xMax; annotations.labelWeakening.yValue = yMin;
    annotations.labelLagging.xValue = xMin;   annotations.labelLagging.yValue = yMin;
    annotations.labelImproving.xValue = xMin; annotations.labelImproving.yValue = yMax;
    
    const xAdjust = 15, yAdjust = 15;
    annotations.labelLeading.xAdjust = -xAdjust;   annotations.labelLeading.yAdjust = yAdjust;
    annotations.labelWeakening.xAdjust = -xAdjust; annotations.labelWeakening.yAdjust = -yAdjust;
    annotations.labelLagging.xAdjust = xAdjust;     annotations.labelLagging.yAdjust = -yAdjust;
    annotations.labelImproving.xAdjust = xAdjust;   annotations.labelImproving.yAdjust = yAdjust;
}


function updateDataTable(points) {
    dataTableBody.innerHTML = '';
    points.sort((a, b) => a.name.localeCompare(b.name)).forEach(point => {
        const row = dataTableBody.insertRow();
        row.innerHTML = `<td>${point.name} (${point.symbol})</td><td>${point.rs_ratio.toFixed(2)}</td><td>${point.rs_momentum.toFixed(2)}</td>`;
    });
}

function setLoadingState(isLoading) {
    dateSlider.disabled = isLoading;
    benchmarkSelect.disabled = isLoading;
    if (isLoading) {
        dateDisplay.textContent = '読込中...';
        dataTableBody.innerHTML = '<tr><td colspan="3">データを読み込んでいます...</td></tr>';
    }
}

function setErrorState(message) {
    dateDisplay.textContent = 'エラー';
    dataTableBody.innerHTML = `<tr><td colspan="3">${message}</td></tr>`;
    if(rrgChart) {
        rrgChart.data.datasets = [];
        rrgChart.update();
    }
}

