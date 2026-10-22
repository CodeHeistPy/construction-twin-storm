import esriConfig from "@arcgis/core/config";
import { defineCustomElements as defineCalciteElements } from "@esri/calcite-components/loader";
import { defineCustomElements as defineMapElements } from "@arcgis/map-components/loader";
import { PORTAL_URL } from "../config/site";

let initialized = false;

/**
 * Register web components and configure the portal. SDK 5.x (Lumina) does not
 * register elements on import; defineCustomElements() must run before React
 * renders <ArcgisScene>. Idempotent for StrictMode.
 */
export function initArcgis(): void {
  if (initialized) return;
  initialized = true;

  defineCalciteElements();
  defineMapElements();

  esriConfig.portalUrl = PORTAL_URL;

  // Never sign in: the web scene is public, but each building layer links to a
  // feature service that is not, and the SDK would pop a sign-in prompt
  // mid-demo. Popups fall back to the scene layer's own attributes.
  esriConfig.request.useIdentity = false;
}
