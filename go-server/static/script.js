// --- グローバル変数 ---
let rrgChart = null;
let fullRrgData = [];
let tickers = [];
const TAIL_LENGTH = 5; // 軌跡（尻尾）の長さ

// --- DOM要素 ---
const benchmarkSelect = document.getElementById('benchmark-select');
const dateSlider = document.getElementById('date-slider');
const dateDisplay = document.getElementById('date-display');
const dataTableBody = document.getElementById('data-table-body');
const chartCanvas = document.getElementById('rrgChart');

// --- 初期化処理 ---
document.addEventListener('DOMContentLoaded', async () => {
    await initializeSelectors();
    
    benchmarkSelect.addEventListener('change', handleControlsChange);
    dateSlider.addEventListener('input', updateUIForSlider);

    initializeChart();
    await handleControlsChange();
});

// --- 関数定義 ---

async function initializeSelectors() {
    try {
        const response = await fetch('/api/tickers');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        tickers = await response.json();

        benchmarkSelect.innerHTML = '';
        tickers.forEach(ticker => {
            const option = new Option(ticker.name, ticker.ticker);
            benchmarkSelect.appendChild(option);
        });
        
        const defaultBenchmark = "1306.T";
        if (tickers.some(t => t.ticker === defaultBenchmark)) {
            benchmarkSelect.value = defaultBenchmark;
        }
    } catch (error) {
        console.error('Failed to load tickers:', error);
        benchmarkSelect.innerHTML = '<option>銘柄読込失敗</option>';
    }
}

async function handleControlsChange() {
    const selectedBenchmark = benchmarkSelect.value;
    if (!selectedBenchmark) return;

    dateSlider.disabled = true;
    dateDisplay.textContent = '読込中...';
    dataTableBody.innerHTML = '<tr><td colspan="3">データを読み込んでいます...</td></tr>';
    if (rrgChart) {
        rrgChart.data.datasets = [];
        rrgChart.update();
    }

    try {
        const response = await fetch(`/api/calculate?benchmark_ticker=${selectedBenchmark}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        fullRrgData = await response.json();

        if (fullRrgData && fullRrgData.length > 0) {
            // 1. 全期間のデータから軸の表示範囲を計算
            const { xMin, xMax, yMin, yMax } = calculateSymmetricalScale(fullRrgData);
            
            // 2. 計算した範囲をチャートの軸、背景色、ラベル位置に設定
            updateChartScalesAndAnnotations(xMin, xMax, yMin, yMax);

            // 3. 日付スライダーを更新
            dateSlider.max = fullRrgData.length - 1;
            dateSlider.value = fullRrgData.length - 1;
            dateSlider.disabled = false;
            
            // 4. 最新の日付でUIを更新
            updateUIForSlider();
        } else {
            dateDisplay.textContent = 'データなし';
            dataTableBody.innerHTML = '<tr><td colspan="3">表示できるデータがありません。</td></tr>';
        }
    } catch (error) {
        console.error('Failed to fetch RRG data:', error);
        dateDisplay.textContent = 'エラー';
    }
}

/**
 * 日付スライダーの値に基づいてチャートとテーブルを更新する
 */
function updateUIForSlider() {
    if (!rrgChart || !fullRrgData || fullRrgData.length === 0) return;

    const sliderIndex = parseInt(dateSlider.value, 10);
    const selectedDateData = fullRrgData[sliderIndex];

    if (!selectedDateData || !selectedDateData.points || selectedDateData.points.length === 0) return;

    dateDisplay.textContent = selectedDateData.date;
    
    rrgChart.data.datasets = createChartDatasets(sliderIndex);
    rrgChart.update('none'); // アニメーションなしでデータのみ更新

    updateDataTable(selectedDateData.points);
}

/**
 * (100, 100)が中心になるように、全期間データから対称な表示範囲を計算する
 */
function calculateSymmetricalScale(data) {
    let maxAbsXDev = 0;
    let maxAbsYDev = 0;
    
    data.forEach(datePoint => {
        datePoint.points.forEach(p => {
            if (isFinite(p.rs_ratio)) {
                maxAbsXDev = Math.max(maxAbsXDev, Math.abs(p.rs_ratio - 100));
            }
            if (isFinite(p.rs_momentum)) {
                maxAbsYDev = Math.max(maxAbsYDev, Math.abs(p.rs_momentum - 100));
            }
        });
    });

    const xPadding = maxAbsXDev * 0.1 || 1;
    const yPadding = maxAbsYDev * 0.1 || 1;

    return {
        xMin: 100 - maxAbsXDev - xPadding,
        xMax: 100 + maxAbsXDev + xPadding,
        yMin: 100 - maxAbsYDev - yPadding,
        yMax: 100 + maxAbsYDev + yPadding,
    };
}

/**
 * チャートの軸、背景色、ラベルの範囲と位置を更新する
 */
function updateChartScalesAndAnnotations(xMin, xMax, yMin, yMax) {
    if (!rrgChart) return;
    
    // 軸の範囲を更新
    rrgChart.options.scales.x.min = xMin;
    rrgChart.options.scales.x.max = xMax;
    rrgChart.options.scales.y.min = yMin;
    rrgChart.options.scales.y.max = yMax;

    // Annotationプラグインの要素を取得
    const annotations = rrgChart.options.plugins.annotation.annotations;
    
    // 背景色の範囲を更新
    annotations.leadingBox.xMax = xMax;
    annotations.leadingBox.yMax = yMax;
    annotations.weakeningBox.xMin = xMin;
    annotations.weakeningBox.yMax = yMax;
    annotations.laggingBox.xMin = xMin;
    annotations.laggingBox.yMin = yMin;
    annotations.improvingBox.xMax = xMax;
    annotations.improvingBox.yMin = yMin;

    // ラベルの位置を隅に固定
    annotations.labelLeading.xValue = xMax;
    annotations.labelLeading.yValue = yMax;
    annotations.labelWeakening.xValue = xMax;
    annotations.labelWeakening.yValue = yMin;
    annotations.labelLagging.xValue = xMin;
    annotations.labelLagging.yValue = yMin;
    annotations.labelImproving.xValue = xMin;
    annotations.labelImproving.yValue = yMax;
}


function createChartDatasets(sliderIndex) {
    const colors = ['#e6194B', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#bcf60c', '#fabebe', '#008080', '#e6beff', '#9A6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1', '#000075'];
    const datasets = [];
    const currentPoints = fullRrgData[sliderIndex].points;

    currentPoints.forEach((point, i) => {
        const color = colors[i % colors.length];
        const tailData = [];
        const startIndex = Math.max(0, sliderIndex - TAIL_LENGTH + 1);

        for (let j = startIndex; j <= sliderIndex; j++) {
            const dayData = fullRrgData[j];
            const pointForDay = dayData.points.find(p => p.symbol === point.symbol);
            if (pointForDay) {
                tailData.push({ x: pointForDay.rs_ratio, y: pointForDay.rs_momentum });
            }
        }

        datasets.push({ type: 'line', data: tailData, borderColor: color, borderWidth: 2, pointRadius: 0, fill: false });
        datasets.push({ type: 'scatter', label: point.name, data: [{ x: point.rs_ratio, y: point.rs_momentum }], backgroundColor: color, pointRadius: 6, pointHoverRadius: 8 });
    });
    return datasets;
}

function updateDataTable(points) {
    dataTableBody.innerHTML = '';
    points.sort((a, b) => a.name.localeCompare(b.name)).forEach(point => {
        const row = dataTableBody.insertRow();
        row.innerHTML = `<td>${point.name}</td><td>${point.rs_ratio.toFixed(2)}</td><td>${point.rs_momentum.toFixed(2)}</td>`;
    });
}

function initializeChart() {
    const ctx = chartCanvas.getContext('2d');
    rrgChart = new Chart(ctx, {
        data: { datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: 'Relative Rotation Graph (RRG)', font: { size: 18 }},
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            if (context.dataset.type !== 'scatter') return null;
                            return `${context.dataset.label}: (Ratio: ${context.parsed.x.toFixed(2)}, Mom: ${context.parsed.y.toFixed(2)})`;
                        }
                    }
                },
                annotation: {
                    annotations: {
                        // ★★★ 背景色の設定を更新 ★★★
                        leadingBox:   { type: 'box', xMin: 100, yMin: 100, backgroundColor: 'rgba(224, 255, 224, 0.5)', borderColor: 'transparent', drawTime: 'beforeDatasets' },
                        improvingBox: { type: 'box', xMin: 100, yMax: 100, backgroundColor: 'rgba(224, 240, 255, 0.5)', borderColor: 'transparent', drawTime: 'beforeDatasets' },
                        laggingBox:   { type: 'box', xMax: 100, yMax: 100, backgroundColor: 'rgba(255, 224, 224, 0.5)', borderColor: 'transparent', drawTime: 'beforeDatasets' },
                        weakeningBox: { type: 'box', xMax: 100, yMin: 100, backgroundColor: 'rgba(255, 255, 224, 0.5)', borderColor: 'transparent', drawTime: 'beforeDatasets' },
                        
                        lineX: { type: 'line', xMin: 100, xMax: 100, borderColor: 'grey', borderWidth: 1, borderDash: [6, 6] },
                        lineY: { type: 'line', yMin: 100, yMax: 100, borderColor: 'grey', borderWidth: 1, borderDash: [6, 6] },
                        
                        // ★★★ ラベルの位置調整 ★★★
                        labelLeading:   { type: 'label', content: '先行', color: 'green',  position: {x:'end', y:'start'}, xAdjust: -10, yAdjust: 10, font: {size: 14}},
                        labelWeakening: { type: 'label', content: '停滞', color: 'orange', position: {x:'end', y:'end'},   xAdjust: -10, yAdjust: -10, font: {size: 14}},
                        labelLagging:   { type: 'label', content: '遅行', color: 'red',    position: {x:'start', y:'end'}, xAdjust: 10, yAdjust: -10, font: {size: 14}},
                        labelImproving: { type: 'label', content: '改善', color: 'blue',   position: {x:'start', y:'start'}, xAdjust: 10, yAdjust: 10, font: {size: 14}}
                    }
                }
            },
            scales: {
                x: { type: 'linear', beginAtZero: false, title: { display: true, text: 'RS-Ratio (相対強度)' } },
                y: { type: 'linear', beginAtZero: false, title: { display: true, text: 'RS-Momentum (モメンタム)' } }
            }
        }
    });
}

