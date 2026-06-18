// Client for the per-image modal-setup sidecar (core/modal_setup_api.py).
// Keyed by the viewer's displayedHash (== the editor's editDocHash). Best-effort:
// every call swallows its own errors and returns a safe value, so persistence
// can never block or break a render. See dev-promptchain/docs/plans/modal-setup-persistence.md.

const isHash = (h) => /^[0-9a-f]{64}$/.test(h || "");

// Returns the whole manifest { version, dims:{w,h}, kinds:{upscale,inpaint,repose} }
// or null when there's nothing saved / no usable key.
export async function loadModalSetup(fetchApi, hash) {
  if (!fetchApi || !isHash(hash)) return null;
  try {
    const res = await fetchApi(`/promptchain/modal-setup/${hash}`);
    if (!res?.ok) return null; // 404 = no sidecar yet
    const doc = await res.json();
    return doc && typeof doc === "object" && doc.kinds ? doc : null;
  } catch {
    return null;
  }
}

// Merge ONE tool's setup into the image's sidecar (server preserves the others).
// `data` is the kind's plain object; `dims` = {w,h} for the restore-time guard;
// `planes` maps "<kind>__<name>.png" -> Blob (e.g. the inpaint mask). Returns ok.
export async function saveModalSetup(fetchApi, hash, kind, data, dims = null, planes = {}) {
  if (!fetchApi || !isHash(hash) || !kind) return false;
  try {
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("data", JSON.stringify(data ?? {}));
    if (dims) fd.append("dims", JSON.stringify(dims));
    for (const [name, blob] of Object.entries(planes)) fd.append(name, blob, name);
    const res = await fetchApi(`/promptchain/modal-setup/${hash}`, { method: "POST", body: fd });
    return !!res?.ok;
  } catch {
    return false;
  }
}

// Drop one kind (kind set) or the whole image's sidecar (kind null). Used to
// invalidate a stale setup when content is unchanged (same hash).
export async function deleteModalSetup(fetchApi, hash, kind = null) {
  if (!fetchApi || !isHash(hash)) return false;
  try {
    const q = kind ? `?kind=${encodeURIComponent(kind)}` : "";
    const res = await fetchApi(`/promptchain/modal-setup/${hash}${q}`, { method: "DELETE" });
    return !!res?.ok;
  } catch {
    return false;
  }
}
