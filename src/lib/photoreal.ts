import esriRequest from "@arcgis/core/request";
import IntegratedMesh3DTilesLayer from "@arcgis/core/layers/IntegratedMesh3DTilesLayer";
import SceneModifications from "@arcgis/core/layers/support/SceneModifications";
import SceneModification from "@arcgis/core/layers/support/SceneModification";
import Polygon from "@arcgis/core/geometry/Polygon";
import { PORTAL_URL } from "../config/site";

// =============================================================================
// GOOGLE PHOTOREALISTIC 3D TILES for the Completed Building view (user,
// 2026-10-22: the closing "wow"). Only for a signed-in presenter: Google's
// tiles need a key that ArcGIS Online hands out to signed-in members of an org
// with Google 3D tiles enabled (the SDK itself asks the same endpoint:
// portals/self/modules/g3dtiles). Signed out, the app never asks, and the
// view keeps its Topographic + 3D mesh look.
// =============================================================================

/** Google's tileset (the same URL ArcGIS Online's "Photorealistic" basemap uses). */
const GOOGLE_TILES_URL = "https://tile.googleapis.com/v1/3dtiles/root.json";

/**
 * The office park site (Office_Park_Site layer extent): Google's mesh is
 * flattened ("replace") here so today's real-world site doesn't poke through
 * or overlap the designed buildings and paving. z = the site's ground (~1,589 m);
 * replace flattens to the lowest vertex.
 */
const SITE_FOOTPRINT = {
  xmin: -104.99209223212618,
  ymin: 39.69672226403196,
  xmax: -104.99015840228294,
  ymax: 39.70000642443952,
  z: 1589.5,
};

/**
 * Problem text goes on screen, in front of an audience: strip the token and
 * key values, and any token= / key= parameter of a URL quoted in an error.
 */
export function redact(text: string, ...secrets: string[]): string {
  let out = text.replace(/\b(token|key)=[^&\s)]+/gi, "$1=…");
  for (const s of secrets) if (s) out = out.split(s).join("…");
  return out;
}

/** Ask the portal for the Google 3D tiles key, with the presenter's token (a GET, as the SDK's own request). */
export async function fetchGoogleTilesKey(token: string): Promise<{ key: string | null; problem?: string }> {
  try {
    const r = await esriRequest(`${PORTAL_URL}/sharing/rest/portals/self/modules/g3dtiles`, {
      query: { f: "json", token },
      responseType: "json",
    });
    const key = (r.data as { keyString?: string })?.keyString ?? null;
    if (key) return { key };
    console.warn("[photoreal] the portal returned no Google 3D tiles key", r.data);
    return { key: null, problem: "the portal returned no Google 3D tiles key" };
  } catch (e) {
    console.warn("[photoreal] Google 3D tiles key request failed (org setting or permission)", e);
    return { key: null, problem: redact(`no Google 3D tiles key for this sign-in (${(e as Error).message})`, token) };
  }
}

/**
 * Ask Google for the root tileset with the key, to say WHY tiles won't draw
 * (e.g. a key restricted to other websites). Null when Google accepts it.
 */
export async function probeGoogleTiles(key: string): Promise<string | null> {
  try {
    const r = await fetch(`${GOOGLE_TILES_URL}?key=${encodeURIComponent(key)}`);
    if (r.ok) return null;
    let detail = "";
    try {
      detail = ((await r.json()) as { error?: { message?: string } }).error?.message ?? "";
    } catch {
      // not JSON
    }
    console.warn("[photoreal] Google refused the tiles request", r.status, detail);
    return redact(`Google answered ${r.status}${detail ? `: ${detail}` : ""}`, key);
  } catch (e) {
    return redact(`Google tiles request failed: ${(e as Error).message}`, key);
  }
}

/** Google's photorealistic mesh, flattened over the site. Hidden until the view turns it on. */
export function createPhotorealLayer(key: string): IntegratedMesh3DTilesLayer {
  const { xmin, ymin, xmax, ymax, z } = SITE_FOOTPRINT;
  const site = new Polygon({
    hasZ: true,
    rings: [
      [
        [xmin, ymin, z],
        [xmin, ymax, z],
        [xmax, ymax, z],
        [xmax, ymin, z],
        [xmin, ymin, z],
      ],
    ],
    spatialReference: { wkid: 4326 },
  });
  return new IntegratedMesh3DTilesLayer({
    url: GOOGLE_TILES_URL,
    title: "Photorealistic 3D (Google)",
    listMode: "hide",
    visible: false,
    customParameters: { key },
    modifications: new SceneModifications([new SceneModification({ geometry: site, type: "replace" })]),
  });
}
