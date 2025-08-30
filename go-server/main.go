package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
)

// Python計算サーバーのURL。docker-compose.ymlの環境変数から取得する。
var pythonCalculatorURL = "http://python-server:8001"

// /api/tickers へのリクエストをPythonの /tickers に中継するハンドラ
func tickersHandler(w http.ResponseWriter, r *http.Request) {
	// Pythonサーバーにリクエストを転送
	reqURL := fmt.Sprintf("%s/tickers", pythonCalculatorURL)
	resp, err := http.Get(reqURL)
	if err != nil {
		http.Error(w, "Failed to connect to calculation service", http.StatusInternalServerError)
		log.Printf("Error connecting to Python tickers endpoint: %v", err)
		return
	}
	defer resp.Body.Close()

	// Pythonからのレスポンスをそのままブラウザに返す
	w.Header().Set("Content-Type", "application/json")
	io.Copy(w, resp.Body)
}

// /api/calculate へのリクエストをPythonの /calculate に中継するハンドラ
func calculateHandler(w http.ResponseWriter, r *http.Request) {
	// ブラウザからのリクエストに含まれるクエリパラメータを取得
	benchmarkTicker := r.URL.Query().Get("benchmark_ticker")
	if benchmarkTicker == "" {
		http.Error(w, "Missing 'benchmark_ticker' query parameter", http.StatusBadRequest)
		return
	}

	// Pythonサーバーにリクエストを転送
	reqURL := fmt.Sprintf("%s/calculate?benchmark_ticker=%s", pythonCalculatorURL, benchmarkTicker)
	resp, err := http.Get(reqURL)
	if err != nil {
		http.Error(w, "Failed to connect to calculation service", http.StatusInternalServerError)
		log.Printf("Error connecting to Python calculate endpoint: %v", err)
		return
	}
	defer resp.Body.Close()

	// Pythonからのレスポンスをそのままブラウザに返す
	w.Header().Set("Content-Type", "application/json")
	io.Copy(w, resp.Body)
}

func main() {
	// 環境変数からPythonサーバーのURLを読み込む (docker-compose.ymlで設定)
	if url := os.Getenv("PYTHON_CALCULATOR_URL"); url != "" {
		pythonCalculatorURL = url
	}

	// 静的ファイル(HTML/CSS/JS)を配信する
	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/", fs)

	// APIエンドポイントのハンドラを設定
	http.HandleFunc("/api/tickers", tickersHandler)
	http.HandleFunc("/api/calculate", calculateHandler)

	log.Println("Go main server starting on :8080...")
	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		log.Fatalf("Could not start server: %s\n", err)
	}
}
