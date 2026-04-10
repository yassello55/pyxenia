import requests
import pandas as pd
import numpy as np
import time
from datetime import datetime
from typing import List, Dict, Optional


class DeepDipAccumulationScanner:
    """
    Institutional-style accumulation scanner.
    Ranks Binance USDT pairs by post-dump capital accumulation.
    """

    def __init__(self):
        self.base_url = "https://api.binance.com/api/v3"

        # ===== PARAMETERS =====
        self.DUMP_LOOKBACK = 48        # hours
        self.DUMP_THRESHOLD = -0.18   # -18% drop
        self.ACCUM_WINDOW = 36        # hours after dump bottom
        self.MIN_CANDLES = 180

    # ==========================================================
    # DATA
    # ==========================================================

    def get_all_usdt_pairs(self, min_volume_24h: float = 2_000_000) -> List[str]:
        """Fetch liquid USDT pairs"""
        url = f"{self.base_url}/ticker/24hr"
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        data = r.json()

        pairs = []
        for t in data:
            if (
                t["symbol"].endswith("USDT")
                and not t["symbol"].endswith("BUSDUSDT")
                and float(t["quoteVolume"]) >= min_volume_24h
            ):
                pairs.append(t["symbol"])

        return sorted(pairs)

    def get_klines(self, symbol: str, interval: str = "1h", limit: int = 300) -> Optional[pd.DataFrame]:
        url = f"{self.base_url}/klines"
        params = {"symbol": symbol, "interval": interval, "limit": limit}

        try:
            r = requests.get(url, params=params, timeout=10)
            r.raise_for_status()
            data = r.json()

            df = pd.DataFrame(data, columns=[
                "timestamp", "open", "high", "low", "close", "volume",
                "close_time", "quote_volume", "trades",
                "taker_buy_base", "taker_buy_quote", "ignore"
            ])

            for col in ["open", "high", "low", "close", "volume"]:
                df[col] = pd.to_numeric(df[col], errors="coerce")

            df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
            return df

        except Exception:
            return None

    # ==========================================================
    # CORE LOGIC
    # ==========================================================

    def detect_hard_dump(self, df: pd.DataFrame) -> Optional[int]:
        df = df.copy()
        df["ret"] = df["close"].pct_change(self.DUMP_LOOKBACK)

        dump = df[df["ret"] <= self.DUMP_THRESHOLD]
        if dump.empty:
            return None

        dump_idx = dump.index[-1]
        bottom_idx = df["low"].iloc[dump_idx:dump_idx + 6].idxmin()
        return bottom_idx

    def accumulation_analysis(self, df: pd.DataFrame, dump_idx: int) -> Optional[Dict]:
        post = df.iloc[dump_idx:dump_idx + self.ACCUM_WINDOW]
        pre = df.iloc[dump_idx - self.ACCUM_WINDOW:dump_idx]

        if len(post) < 10 or len(pre) < 10:
            return None

        # ---- Capital Inflow (USD proxy) ----
        post_usd = (post["close"] * post["volume"]).sum()
        pre_usd = (pre["close"] * pre["volume"]).sum()
        if pre_usd == 0:
            return None

        capital_inflow_ratio = post_usd / pre_usd

        # ---- Volume Expansion ----
        volume_ratio = post["volume"].mean() / pre["volume"].mean()

        # ---- Absorption (tight range) ----
        range_pct = (post["high"].max() - post["low"].min()) / post["close"].iloc[0]
        absorption_score = max(0, 1 - range_pct * 10)

        # ---- VWAP Hold ----
        vwap = (post["close"] * post["volume"]).sum() / post["volume"].sum()
        vwap_hold = post["close"].iloc[-1] > vwap

        return {
            "capital_inflow_ratio": round(capital_inflow_ratio, 2),
            "volume_ratio": round(volume_ratio, 2),
            "range_pct": round(range_pct * 100, 2),
            "absorption_score": round(absorption_score, 2),
            "vwap_hold": vwap_hold
        }

    def accumulation_score(self, d: Dict) -> float:
        score = 0
        score += min(d["capital_inflow_ratio"], 3) * 30
        score += min(d["volume_ratio"], 3) * 20
        score += d["absorption_score"] * 25
        if d["vwap_hold"]:
            score += 15
        return round(score, 2)

    def analyze_coin(self, symbol: str) -> Optional[Dict]:
        df = self.get_klines(symbol, "1h", 300)
        if df is None or len(df) < self.MIN_CANDLES:
            return None

        dump_idx = self.detect_hard_dump(df)
        if dump_idx is None:
            return None

        accum = self.accumulation_analysis(df, dump_idx)
        if not accum:
            return None

        score = self.accumulation_score(accum)

        return {
            "symbol": symbol,
            "score": score,
            **accum
        }

    # ==========================================================
    # MARKET SCAN
    # ==========================================================

    def scan_market(self, min_volume_24h: float = 2_000_000) -> pd.DataFrame:
        print("\n🔥 SCANNING BINANCE FOR DEEP DIP ACCUMULATION 🔥\n")

        pairs = self.get_all_usdt_pairs(min_volume_24h)
        print(f"Pairs scanned: {len(pairs)}\n")

        results = []

        for i, symbol in enumerate(pairs, 1):
            if i % 40 == 0:
                print(f"Progress: {i}/{len(pairs)}")
                time.sleep(0.4)

            data = self.analyze_coin(symbol)
            if data:
                results.append(data)

        df = pd.DataFrame(results)
        if df.empty:
            return df

        df.sort_values("score", ascending=False, inplace=True)
        df.reset_index(drop=True, inplace=True)
        df.index += 1
        return df


# ==========================================================
# MAIN
# ==========================================================

if __name__ == "__main__":

    scanner = DeepDipAccumulationScanner()

    ranking = scanner.scan_market()

    print("\n🏆 TOP 25 COINS BY ACCUMULATION CAPITAL\n")
    print(ranking.head(25).to_string())

    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    filename = f"deep_dip_accumulation_ranking_{timestamp}.csv"
    ranking.to_csv(filename, index=True)

    print(f"\n💾 Full ranking saved to {filename}")
    print("\n⚠️ Educational use only. Not financial advice.")
