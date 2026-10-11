import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  Holding,
  RiskLevel,
  RiskLabel,
  Currency,
  Period,
  Benchmark,
  AnalyzeResponse,
  AllocateResponse,
  Meta,
  Preset,
} from "../api/types";
import { analyzePortfolio, allocatePortfolio } from "../api/client";

export const DEMO_HOLDINGS: Holding[] = [
  { ticker: "NVDA", amount: 250000 },
  { ticker: "TSLA", amount: 200000 },
  { ticker: "RELIANCE.NS", amount: 200000 },
  { ticker: "TCS.NS", amount: 150000 },
  { ticker: "HDFCBANK.NS", amount: 100000 },
  { ticker: "GOLDBEES.NS", amount: 100000 },
];

export const DEMO_AMOUNT = 1000000;
export const DEMO_RISK_LEVEL: RiskLevel = "high";
export const DEMO_CURRENCY: Currency = "INR";
export const DEMO_PERIOD: Period = { preset: "3y" };
export const DEMO_BENCHMARK: Benchmark = "NIFTY50";

const STORAGE_KEY = "riskscope_portfolio_v2";

interface StoredPortfolioState {
  holdings: Holding[];
  risk_level: RiskLevel;
  amount: number;
  currency: Currency;
  period: Period;
  benchmark: Benchmark;
}

interface PortfolioContextType {
  holdings: Holding[];
  risk_level: RiskLevel;
  amount: number;
  currency: Currency;
  period: Period;
  benchmark: Benchmark;
  setHoldings: (holdings: Holding[]) => void;
  setRiskLevel: (level: RiskLevel) => void;
  setAmount: (amount: number) => void;
  setCurrency: (currency: Currency) => void;
  setPeriod: (period: Period) => void;
  setBenchmark: (benchmark: Benchmark) => void;
  loadDemoPortfolio: () => void;
  loadPreset: (preset: Preset) => void;
  applyCounterfactual: (weights: Record<string, number>, targetLabel?: RiskLabel) => void;
  analyzeData: AnalyzeResponse | undefined;
  isAnalyzing: boolean;
  analyzeError: Error | null;
  refetchAnalyze: () => void;
  allocateData: AllocateResponse | undefined;
  isAllocating: boolean;
  allocateError: Error | null;
  refetchAllocate: () => void;
  meta: Meta | null;
}

const PortfolioContext = createContext<PortfolioContextType | null>(null);

function loadInitialState(): StoredPortfolioState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.holdings) && parsed.holdings.length > 0) {
        return {
          holdings: parsed.holdings,
          risk_level: parsed.risk_level || DEMO_RISK_LEVEL,
          amount: typeof parsed.amount === "number" ? parsed.amount : DEMO_AMOUNT,
          currency: parsed.currency || DEMO_CURRENCY,
          period: parsed.period || DEMO_PERIOD,
          benchmark: parsed.benchmark || DEMO_BENCHMARK,
        };
      }
    }
  } catch (err) {
    console.error("Failed to load stored portfolio state", err);
  }

  return {
    holdings: DEMO_HOLDINGS,
    risk_level: DEMO_RISK_LEVEL,
    amount: DEMO_AMOUNT,
    currency: DEMO_CURRENCY,
    period: DEMO_PERIOD,
    benchmark: DEMO_BENCHMARK,
  };
}

export const PortfolioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [initial] = useState(loadInitialState);

  const [holdings, setHoldingsState] = useState<Holding[]>(initial.holdings);
  const [riskLevel, setRiskLevel] = useState<RiskLevel>(initial.risk_level);
  const [amount, setAmount] = useState<number>(initial.amount);
  const [currency, setCurrency] = useState<Currency>(initial.currency);
  const [period, setPeriod] = useState<Period>(initial.period);
  const [benchmark, setBenchmark] = useState<Benchmark>(initial.benchmark);

  // Debounced parameters for network refetch (400ms debounce)
  const [debouncedParams, setDebouncedParams] = useState({
    holdings,
    risk_level: riskLevel,
    amount,
    currency,
    period,
    benchmark,
  });

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Persist immediately to localStorage
    try {
      const stateToStore: StoredPortfolioState = {
        holdings,
        risk_level: riskLevel,
        amount,
        currency,
        period,
        benchmark,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToStore));
    } catch (err) {
      console.error("Failed to persist portfolio state", err);
    }

    // Debounce network triggers by 400ms
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedParams({
        holdings,
        risk_level: riskLevel,
        amount,
        currency,
        period,
        benchmark,
      });
    }, 400);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [holdings, riskLevel, amount, currency, period, benchmark]);

  const setHoldings = useCallback((newHoldings: Holding[]) => {
    setHoldingsState(newHoldings);
    const sum = newHoldings.reduce((acc, h) => acc + (Number(h.amount) || 0), 0);
    if (sum > 0) {
      setAmount(sum);
    }
  }, []);

  const loadDemoPortfolio = useCallback(() => {
    setHoldingsState(DEMO_HOLDINGS);
    setAmount(DEMO_AMOUNT);
    setRiskLevel(DEMO_RISK_LEVEL);
    setCurrency(DEMO_CURRENCY);
    setPeriod(DEMO_PERIOD);
    setBenchmark(DEMO_BENCHMARK);
  }, []);

  const loadPreset = useCallback((preset: Preset) => {
    setHoldingsState(preset.holdings);
    const sum = preset.holdings.reduce((acc, h) => acc + (Number(h.amount) || 0), 0);
    setAmount(sum > 0 ? sum : DEMO_AMOUNT);
    setRiskLevel(preset.risk_level);
    setCurrency(preset.currency);
  }, []);

  const applyCounterfactual = useCallback(
    (weights: Record<string, number>, targetLabel?: RiskLabel) => {
      const totalAmt = amount || DEMO_AMOUNT;
      const newHoldings: Holding[] = Object.entries(weights)
        .filter(([, w]) => w > 0.001)
        .map(([ticker, w]) => ({
          ticker,
          amount: Math.round(w * totalAmt),
        }));

      setHoldingsState(newHoldings);
      if (targetLabel) {
        setRiskLevel(targetLabel.toLowerCase() as RiskLevel);
      }
    },
    [amount]
  );

  // TanStack Query for /analyze
  const analyzeQuery = useQuery({
    queryKey: [
      "analyze",
      debouncedParams.holdings,
      debouncedParams.risk_level,
      debouncedParams.period,
      debouncedParams.currency,
    ],
    queryFn: () =>
      analyzePortfolio({
        holdings: debouncedParams.holdings,
        risk_level: debouncedParams.risk_level,
        period: debouncedParams.period,
        currency: debouncedParams.currency,
      }),
    enabled: debouncedParams.holdings.length >= 2,
    staleTime: 1000 * 60 * 5,
  });

  // TanStack Query for /allocate
  const tickers = useMemo(
    () => debouncedParams.holdings.map((h) => h.ticker),
    [debouncedParams.holdings]
  );

  const allocateQuery = useQuery({
    queryKey: [
      "allocate",
      tickers,
      debouncedParams.amount,
      debouncedParams.risk_level,
      debouncedParams.period,
      debouncedParams.currency,
    ],
    queryFn: () => {
      const total = debouncedParams.holdings.reduce((acc, h) => acc + h.amount, 0);
      const currentWeights: Record<string, number> = {};
      debouncedParams.holdings.forEach((h) => {
        currentWeights[h.ticker] = total > 0 ? h.amount / total : 0;
      });

      return allocatePortfolio({
        tickers,
        amount: debouncedParams.amount,
        risk_level: debouncedParams.risk_level,
        period: debouncedParams.period,
        currency: debouncedParams.currency,
        current_weights: currentWeights,
      });
    },
    enabled: tickers.length >= 2,
    staleTime: 1000 * 60 * 5,
  });

  const meta = useMemo<Meta | null>(() => {
    return analyzeQuery.data?.meta || allocateQuery.data?.meta || null;
  }, [analyzeQuery.data?.meta, allocateQuery.data?.meta]);

  const value = useMemo(
    () => ({
      holdings,
      risk_level: riskLevel,
      amount,
      currency,
      period,
      benchmark,
      setHoldings,
      setRiskLevel,
      setAmount,
      setCurrency,
      setPeriod,
      setBenchmark,
      loadDemoPortfolio,
      loadPreset,
      applyCounterfactual,
      analyzeData: analyzeQuery.data,
      isAnalyzing: analyzeQuery.isLoading,
      analyzeError: (analyzeQuery.error as Error) || null,
      refetchAnalyze: analyzeQuery.refetch,
      allocateData: allocateQuery.data,
      isAllocating: allocateQuery.isLoading,
      allocateError: (allocateQuery.error as Error) || null,
      refetchAllocate: allocateQuery.refetch,
      meta,
    }),
    [
      holdings,
      riskLevel,
      amount,
      currency,
      period,
      benchmark,
      setHoldings,
      loadDemoPortfolio,
      loadPreset,
      applyCounterfactual,
      analyzeQuery.data,
      analyzeQuery.isLoading,
      analyzeQuery.error,
      analyzeQuery.refetch,
      allocateQuery.data,
      allocateQuery.isLoading,
      allocateQuery.error,
      allocateQuery.refetch,
      meta,
    ]
  );

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
};

export function usePortfolio() {
  const context = useContext(PortfolioContext);
  if (!context) {
    throw new Error("usePortfolio must be used within a PortfolioProvider");
  }
  return context;
}
