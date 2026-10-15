import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@esri/calcite-components/main.css";
import "@arcgis/map-components/main.css";
import "./index.css";
import App from "./App";
import { initArcgis } from "./lib/arcgis";

initArcgis();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
