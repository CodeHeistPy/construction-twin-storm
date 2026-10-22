import esriConfig from "@arcgis/core/config";
import IdentityManager from "@arcgis/core/identity/IdentityManager";
import OAuthInfo from "@arcgis/core/identity/OAuthInfo";
import type Credential from "@arcgis/core/identity/Credential";
import { defineCustomElements as defineCalciteElements } from "@esri/calcite-components/loader";
import { defineCustomElements as defineMapElements } from "@arcgis/map-components/loader";
import { OAUTH_APP_ID, PORTAL_URL } from "../config/site";

let initialized = false;
const SHARING = `${PORTAL_URL}/sharing`;

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

  // Never sign in implicitly: the web scene is public, but each building layer
  // links to a feature service that is not, and the SDK would pop a sign-in
  // prompt mid-demo. Popups fall back to the scene layer's own attributes.
  esriConfig.request.useIdentity = false;

  // Optional, explicit presenter sign-in (OAuth, redirect flow) for the
  // Completed Building view's Google Photorealistic tiles (lib/photoreal.ts).
  // Signing in only stores a credential; requests still don't use it
  // implicitly, so no secured-service prompts either way.
  if (OAUTH_APP_ID) {
    IdentityManager.registerOAuthInfos([
      new OAuthInfo({ appId: OAUTH_APP_ID, portalUrl: PORTAL_URL, popup: false, flowType: "auto" }),
    ]);
    // "?signout" in the URL clears the stored session (there's no on-screen sign-out on stage).
    // Then drop it from the URL: the OAuth redirect returns to the current URL,
    // so a sign-in started there would come back to "?signout" and be undone.
    const params = new URLSearchParams(location.search);
    if (params.has("signout")) {
      IdentityManager.destroyCredentials();
      params.delete("signout");
      const query = params.toString();
      history.replaceState(history.state, "", location.pathname + (query ? `?${query}` : "") + location.hash);
    }
  }
}

/** True when a presenter sign-in is configured (an OAuth client ID is set). */
export const SIGN_IN_AVAILABLE = !!OAUTH_APP_ID;

/** The stored presenter session, if any (after the OAuth redirect, or from an earlier visit). */
export async function presenterCredential(): Promise<Credential | null> {
  if (!OAUTH_APP_ID) return null;
  try {
    return await IdentityManager.checkSignInStatus(SHARING);
  } catch {
    return null;
  }
}

/** Start the OAuth sign-in (redirects to ArcGIS Online and back). */
export function presenterSignIn(): void {
  if (!OAUTH_APP_ID) return;
  void IdentityManager.getCredential(SHARING).catch(() => undefined);
}
