import esriConfig from "@arcgis/core/config";
import IdentityManager from "@arcgis/core/identity/IdentityManager";
import OAuthInfo from "@arcgis/core/identity/OAuthInfo";
import { defineCustomElements as defineCalciteElements } from "@esri/calcite-components/loader";
import { defineCustomElements as defineMapElements } from "@arcgis/map-components/loader";
import { OAUTH_APP_ID, PORTAL_URL } from "../config/site";

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

  // OAuth is optional: only needed when the scene or its layers are secured.
  // With it registered, the IdentityManager redirects to sign in on first
  // access to a secured resource.
  if (OAUTH_APP_ID) {
    IdentityManager.registerOAuthInfos([
      new OAuthInfo({ appId: OAUTH_APP_ID, portalUrl: PORTAL_URL, popup: false, flowType: "auto" }),
    ]);
  }
}
