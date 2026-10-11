import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PortfolioProvider } from "./state/PortfolioContext";
import { Layout } from "./components/Layout";
import { BuildPage } from "./pages/Build";
import { RiskPage } from "./pages/Risk";
import { RecommendPage } from "./pages/Recommend";
import { SimulatePage } from "./pages/Simulate";
import { TrackPage } from "./pages/Track";
import { StrategiesPage } from "./pages/Strategies";
import { StressPage } from "./pages/Stress";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <PortfolioProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<BuildPage />} />
              <Route path="build" element={<Navigate to="/" replace />} />
              <Route path="risk" element={<RiskPage />} />
              <Route path="recommend" element={<RecommendPage />} />
              <Route path="simulate" element={<SimulatePage />} />
              <Route path="track" element={<TrackPage />} />
              <Route path="strategies" element={<StrategiesPage />} />
              <Route path="stress" element={<StressPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </PortfolioProvider>
    </QueryClientProvider>
  );
};

export default App;
