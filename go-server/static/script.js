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

    try {
        const response = await fetch(`/api/calculate?benchmark_ticker=${selectedBenchmark}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        fullRrgData = await response.json();

        if (fullRrgData && fullRrgData.length > 0) {
            dateSlider.max = fullRrgData.length - 1;
            dateSlider.value = fullRrgData.length - 1;
            dateSlider.disabled = false;
            updateUIForSlider();
        } else {
            dateDisplay.textContent = 'データなし';
            dataTableBody.innerHTML = '<tr><td colspan="3">表示できるデータがありません。</td></tr>';
            if (rrgChart) rrgChart.destroy();
            rrgChart = null;
        }
    } catch (error) {
        console.error('Failed to fetch RRG data:', error);
        dateDisplay.textContent = 'エラー';
    }
}

function updateUIForSlider() {
    const sliderIndex = parseInt(dateSlider.value, 10);
    const selectedDateData = fullRrgData[sliderIndex];

    if (!selectedDateData) return;

    dateDisplay.textContent = selectedDateData.date;
    const datasets = createChartDatasets(sliderIndex);
    
    if (!rrgChart) {
        initializeChart(datasets);
    } else {
        rrgChart.data.datasets = datasets;
        rrgChart.update();
    }
    updateDataTable(selectedDateData.points);
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

        datasets.push({
            type: 'line',
            data: tailData,
            borderColor: color,
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
        });

        datasets.push({
            type: 'scatter',
            label: point.name,
            data: [{ x: point.rs_ratio, y: point.rs_momentum }],
            backgroundColor: color,
            pointRadius: 6,
            pointHoverRadius: 8,
        });
    });
    return datasets;
}

function updateDataTable(points) {
    dataTableBody.innerHTML = '';
    points.sort((a, b) => a.name.localeCompare(b.name)).forEach(point => {
        const row = dataTableBody.insertRow();
        row.innerHTML = `
            <td>${point.name}</td>
            <td>${point.rs_ratio.toFixed(2)}</td>
            <td>${point.rs_momentum.toFixed(2)}</td>
        `;
    });
}

/**
 * チャートを初期化する
 */
function initializeChart(initialDatasets) {
    // ★★★ エラーの原因だった Chart.register の行を削除しました ★★★
    const ctx = chartCanvas.getContext('2d');
    rrgChart = new Chart(ctx, {
        data: { datasets: initialDatasets },
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
                            const label = context.dataset.label || '';
                            return `${label}: (Ratio: ${context.parsed.x.toFixed(2)}, Mom: ${context.parsed.y.toFixed(2)})`;
                        }
                    }
                },
                annotation: {
                    annotations: {
                        lineX: { type: 'line', xMin: 100, xMax: 100, borderColor: 'grey', borderWidth: 1, borderDash: [6, 6] },
                        lineY: { type: 'line', yMin: 100, yMax: 100, borderColor: 'grey', borderWidth: 1, borderDash: [6, 6] },
                        labelLeading: { type: 'label', xValue: 101, yValue: 101, content: '先行', color: 'grey', position: 'start', yAdjust: -10, font: {size: 14} },
                        labelWeakening: { type: 'label', xValue: 99, yValue: 101, content: '停滞', color: 'grey', position: 'end', yAdjust: -10, font: {size: 14} },
                        labelLagging: { type: 'label', xValue: 99, yValue: 99, content: '遅行', color: 'grey', position: 'end', yAdjust: 10, font: {size: 14} },
                        labelImproving: { type: 'label', xValue: 101, yValue: 99, content: '改善', color: 'grey', position: 'start', yAdjust: 10, font: {size: 14} }
                    }
                }
            },
            scales: {
                x: { title: { display: true, text: 'RS-Ratio (相対強度)' } },
                y: { title: { display: true, text: 'RS-Momentum (モメンタム)' } }
            }
        }
    });
}

