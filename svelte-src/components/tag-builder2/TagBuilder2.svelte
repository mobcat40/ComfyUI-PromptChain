<script>
  // TagBuilder2 -- v2 ground-up rebuild.
  //
  // Mental model: everything you compose lives on the right panel as a card.
  // - Subject cards (Person / Object) own per-subject descriptors.
  //   Slots are populated by the per-subject categories on the left rail
  //   (Appearance / Clothing / Pose / Expression / Action).
  // - Scene card is global and shared across all subjects.
  //
  // Routing: the active subject is the click target for per-subject
  // categories. Click a subject card to focus it, click again or click empty
  // rail space to defocus. If a per-subject category is clicked with no
  // active subject, a Person subject is auto-spawned and immediately filled.
  // Scene-scoped categories always route to the Scene card.
  //
  // The output composer walks subjects in spawn order, emitting each one's
  // slots (in category order, then group order), then the Scene card.

  import { onMount, tick } from "svelte";
  import { isStructuralLine, isInNegativeBlock } from "../../lib/ai-patch-helpers.js";
  import { formatTagsForModel } from "../../lib/tag-builder-utils.js";
  import Customizer from "./Customizer.svelte";
  import FurnitureCustomizer from "./FurnitureCustomizer.svelte";
  import FantasyCustomizer from "./FantasyCustomizer.svelte";

  // Chip groups that open the modifier customizer instead of dropping
  // straight into a slot. Mirrors v1's CUSTOMIZABLE_GROUPS.
  const CUSTOMIZABLE_CLOTHING_GROUPS = new Set([
    "legwear", "footwear", "lingerie", "underwear", "swimwear",
    "dresses", "handwear", "tops", "bottoms",
  ]);

  let {
    from = 0,
    to = 0,
    initialTab = "all",
    initialQuery = "",
    initialText = "",
    // "subject" (default) | "global". Set by the bridge from WHERE the user
    // opened the builder: inside a $name{} block or a normal whole-doc edit is
    // "subject"; editing outside the regional blocks is "global", so loose
    // text resolves to the scene instead of fabricating a subject.
    editScope = "subject",
    tagSourceConfig = {},
    modelInfo = null,
    onPromptStyleChange = () => {},
    onInsert = () => {},
    onClose = () => {},
  } = $props();

  // ----------------------------------------------------------------------
  //  TAXONOMY
  // ----------------------------------------------------------------------

  // Categories shown in the left rail. `scope` controls routing:
  //   "subject" — lands on the active subject's slot for this category
  //   "global"  — lands on the Scene card
  //   "spawn"   — clicking an item spawns a new subject (Characters)
  const CATEGORIES = [
    { key: "all",        label: "All",        icon: "📋", scope: "all",      enabled: true },
    { key: "subjects",   label: "Subjects",   icon: "🎭", scope: "spawn",    enabled: true },
    { key: "appearance", label: "Appearance", icon: "✨", scope: "subject",  bucket: "appearance", enabled: true },
    { key: "clothing",   label: "Clothing",   icon: "👗", scope: "subject",  bucket: "clothing",   enabled: true },
    { key: "pose",       label: "Pose",       icon: "🧘", scope: "subject",  bucket: "pose",       enabled: true },
    { key: "expression", label: "Expression", icon: "😊", scope: "subject",  bucket: "expression", enabled: true },
    { key: "action",     label: "Action",     icon: "⚡", scope: "subject",  bucket: "action",     enabled: true },
    // NSFW Actions — the dedicated adult-action bucket (solo/foreplay/oral/…).
    // Only appears in the rail when the NSFW toggle is Shown (gated via
    // effectiveCategories) and is never mixed into the "All" view. Picks land on
    // the active subject and emit in its body like a normal action.
    { key: "nsfw_action", label: "NSFW Actions", icon: "🔞", scope: "subject",  bucket: "nsfw_action", enabled: true },
    // Props has a synthetic scope: an active subject routes the pick into
    // an interaction chip on the subject's `furniture` slot (with an action
    // verb); no subject routes it into `sceneSelections.<category>` as a
    // standalone scene element. Same picker, same customizer. The bucket
    // key stays "furniture" historically — it now holds all 16 prop
    // categories (furniture/weapons/food/etc.), not just furniture.
    { key: "furniture",  label: "Props",      icon: "📦", scope: "furniture", bucket: "furniture", enabled: true },
    { key: "scene",      label: "Scene",      icon: "🏠", scope: "global",   bucket: "scene",      enabled: true },
    { key: "styles",     label: "Styles",     icon: "🎨", scope: "style",    enabled: !!modelInfo?.hash },
  ];

  // Drilldown subitems under the "Subjects" rail. `source` is "characters"
  // (filtered by character_series.category) or "cast" (cast_items filtered
  // by item_group). Click behavior is set by source — characters spawn
  // via pickCharacter; cast items spawn a generic Person template (pass 2
  // wires the unified template state).
  const SUBJECT_SUBITEMS = [
    { key: "anime",      label: "Anime",      source: "characters", filter: "anime" },
    { key: "archetype",  label: "Archetype",  source: "cast",       filter: "archetype" },
    { key: "creatures",  label: "Creatures",  source: "cast",       filter: "creatures" },
    { key: "fantasy",    label: "Fantasy",    source: "cast",       filter: "fantasy_beings" },
    { key: "original",   label: "Original",   source: "characters", filter: "original" },
    { key: "video_game", label: "Video Game", source: "characters", filter: "video_game" },
    { key: "vtuber",     label: "V-Tuber",    source: "characters", filter: "vtuber" },
  ];

  // Multi-select groups per bucket. Anything not listed is single-select.
  const MULTI_GROUPS = {
    scene:      new Set(["lighting", "mood", "style", "camera"]),
    appearance: new Set(["fantasy", "body_marks", "hair_style", "body_type", "modifiers", "eye_color", "eyes"]),
    clothing:   new Set(["accessories", "modifiers", "handwear", "headwear", "neckwear", "tops"]),
    pose:       new Set([]),
    expression: new Set([]),
    action:     new Set([]),
    // Every prop category is multi: a scene can stack chair+table+lamp,
    // and a subject can wield a sword while holding an apple. The bucket
    // covers all 16 prop_category_meta keys.
    furniture:  new Set([
      "furniture", "animals", "food", "drinks", "nature", "books",
      "tech", "tools", "misc", "weapons", "vehicles", "sports",
      "toys", "effects", "symbols", "adult",
    ]),
  };

  // Subject types. `slotCategories` is which left-rail categories produce
  // slots in the card body — drives subject-card section rendering.
  const SUBJECT_TYPES = {
    person: {
      label: "Person",
      icon: "👤",
      color: "#7c3aed",
      slotCategories: ["appearance", "clothing", "pose", "expression", "action", "nsfw_action", "furniture"],
    },
    object: {
      label: "Object",
      icon: "📦",
      color: "#10b981",
      slotCategories: ["clothing"],
    },
  };

  const SUBJECT_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  // Canonical modifier tokens (gender count + solo). These render in the
  // Appearance > Modifiers row. The picker renders them as toggleable
  // options so a blank subject can declare "1girl" without binding an
  // identity. Picker layout puts each cluster on its own line via blank
  // entries — the empty string is a separator the renderer skips.
  const MODIFIER_OPTIONS = [
    "1girl", "2girls", "3girls", "4girls", "5girls", "6+girls", "multiple_girls",
    "1boy", "2boys", "3boys", "4boys", "5boys", "6+boys", "multiple_boys",
    "1other", "2others", "multiple_others",
    "solo", "solo_focus",
  ];
  const MODIFIER_TOKENS = new Set(MODIFIER_OPTIONS);
  // Composition modifiers stack freely; every other modifier is a subject
  // count (1girl/2girls/1boy/…) and counts are mutually exclusive — one
  // subject has exactly one count, so picking a new one replaces the old.
  const COMPOSITION_MODIFIERS = new Set(["solo", "solo_focus"]);

  // Natlang renderings for modifier tokens — used when emitting modifiers
  // in natural-language mode. Tokens absent from this map fall back to
  // the raw token (e.g., user added one we don't have a phrase for).
  const MODIFIER_NATLANG = {
    "1girl": "female",
    "2girls": "two females",
    "3girls": "three females",
    "4girls": "four females",
    "5girls": "five females",
    "6+girls": "six or more females",
    "multiple_girls": "multiple females",
    "1boy": "male",
    "2boys": "two males",
    "3boys": "three males",
    "4boys": "four males",
    "5boys": "five males",
    "6+boys": "six or more males",
    "multiple_boys": "multiple males",
    "1other": "one figure",
    "2others": "two figures",
    "multiple_others": "multiple figures",
    "solo": "alone",
    "solo_focus": "solo focus",
  };

  // Card data for the Modifiers left-rail category. Format mirrors bucket
  // items so the existing card-grid + rail-drilldown markup can render
  // them with minimal special-casing.
  const MODIFIER_GROUPS = [
    { group_name: "count_girls", display_name: "Girls" },
    { group_name: "count_boys",  display_name: "Boys" },
    { group_name: "count_other", display_name: "Other" },
    { group_name: "composition", display_name: "Composition" },
  ];
  const MODIFIER_ITEMS = [
    { item_tag: "1girl",            display_name: "1 Girl",          item_group: "count_girls" },
    { item_tag: "2girls",           display_name: "2 Girls",         item_group: "count_girls" },
    { item_tag: "3girls",           display_name: "3 Girls",         item_group: "count_girls" },
    { item_tag: "4girls",           display_name: "4 Girls",         item_group: "count_girls" },
    { item_tag: "5girls",           display_name: "5 Girls",         item_group: "count_girls" },
    { item_tag: "6+girls",          display_name: "6+ Girls",        item_group: "count_girls" },
    { item_tag: "multiple_girls",   display_name: "Multiple Girls",  item_group: "count_girls" },
    { item_tag: "1boy",             display_name: "1 Boy",           item_group: "count_boys" },
    { item_tag: "2boys",            display_name: "2 Boys",          item_group: "count_boys" },
    { item_tag: "3boys",            display_name: "3 Boys",          item_group: "count_boys" },
    { item_tag: "4boys",            display_name: "4 Boys",          item_group: "count_boys" },
    { item_tag: "5boys",            display_name: "5 Boys",          item_group: "count_boys" },
    { item_tag: "6+boys",           display_name: "6+ Boys",         item_group: "count_boys" },
    { item_tag: "multiple_boys",    display_name: "Multiple Boys",   item_group: "count_boys" },
    { item_tag: "1other",           display_name: "1 Other",         item_group: "count_other" },
    { item_tag: "2others",          display_name: "2 Others",        item_group: "count_other" },
    { item_tag: "multiple_others",  display_name: "Multiple Others", item_group: "count_other" },
    { item_tag: "solo",             display_name: "Solo",            item_group: "composition" },
    { item_tag: "solo_focus",       display_name: "Solo Focus",      item_group: "composition" },
  ];
  // Reverse index for click-to-navigate: token → which modifier group.
  const MODIFIER_GROUP_BY_TAG = Object.fromEntries(MODIFIER_ITEMS.map(i => [i.item_tag, i.item_group]));
  // Sentinel activeGroup value for the Appearance > Modifiers drilldown.
  const MODIFIER_GROUP_KEY = "__modifiers";

  // ----------------------------------------------------------------------
  //  STATE
  // ----------------------------------------------------------------------

  let activeCategory = $state("all");
  let activeGroup = $state(null);
  let searchQuery = $state("");
  // The card-grid filter ($derived below) is expensive — it re-diffs thousands
  // of card DOM nodes. Drive it off a debounced copy of the query so typing
  // updates the grid ~5x/sec instead of synchronously on every keystroke (the
  // freeze). The search input stays bound to searchQuery for instant feedback.
  let debouncedQuery = $state("");
  let isNaturalMode = $state(tagSourceConfig.prompt_style === "natural");

  $effect(() => {
    const q = searchQuery;
    const h = setTimeout(() => { debouncedQuery = q; }, 200);
    return () => clearTimeout(h);
  });

  // bucketCache[bucket] = { groups, items, thumbs:Set, loaded, loading }
  let bucketCache = $state({});

  // Characters cache (separate from buckets — different API + much larger).
  let characters = $state([]);
  let charactersTotal = $state(0);
  let charactersLoading = $state(false);
  let charactersSearchHandle = null;
  // Infinite-scroll paging for the character rail: the backend returns the top
  // 60 by post_count per page; loadMoreCharacters appends the next page as the
  // user scrolls, so a narrowed category (e.g. anime, video_game) is fully
  // browsable instead of capped at the first 60.
  let charactersPage = 1;
  let charactersQuery = "";
  let charactersCategory = "";
  let charactersLoadingMore = $state(false);
  // Set of character tags that have a thumb on disk (served from
  // /thumb/characters/<tag>). Loaded once on mount.
  let characterThumbs = $state(new Set());

  // Browser card minmax — Ctrl+wheel in the browser pane resizes thumbs;
  // persisted to localStorage so it survives reloads. Clamp [60, 320].
  // Listener attaches via $effect with { passive: false } so we can call
  // preventDefault — otherwise the browser passive default lets ComfyUI's
  // canvas zoom fire instead.
  // Card grid vs compact list view — top-right toggle in the browser header,
  // persisted. List mode is a pure CSS restyle of the same cards into rows
  // (tiny left thumb + name), so it works in every view for free.
  const VIEW_MODE_KEY = "pcr-atb2-view-mode";
  let viewMode = $state("cards");
  try { const v = localStorage.getItem(VIEW_MODE_KEY); if (v === "list" || v === "cards") viewMode = v; } catch {}
  function setViewMode(m) {
    viewMode = m;
    try { localStorage.setItem(VIEW_MODE_KEY, m); } catch {}
  }

  const CARD_MIN_PX_KEY = "pcr-atb2-card-min-px";
  const CARD_MIN_PX_MIN = 60;
  const CARD_MIN_PX_MAX = 320;
  const CARD_MIN_PX_STEP = 25;
  let cardMinPx = $state(130);
  try {
    const stored = parseInt(localStorage.getItem(CARD_MIN_PX_KEY) || "", 10);
    if (Number.isFinite(stored)) {
      cardMinPx = Math.max(CARD_MIN_PX_MIN, Math.min(CARD_MIN_PX_MAX, stored));
    }
  } catch {}
  let browserEl = $state(null);
  let railEl = $state(null);

  // Maximize toggle — when true the panel covers the full viewport.
  // Persisted so reopening remembers the user's preference.
  const MAXIMIZED_KEY = "pcr-atb2-maximized";
  let maximized = $state(false);
  try { maximized = localStorage.getItem(MAXIMIZED_KEY) === "1"; } catch {}
  function toggleMaximized() {
    maximized = !maximized;
    try { localStorage.setItem(MAXIMIZED_KEY, maximized ? "1" : "0"); } catch {}
  }

  // Recently-used picks (character/cast identities + tag items), persisted to
  // localStorage and surfaced as a pinned strip atop the default "all" view so
  // the things reached for most are one click away — no searching, no schema.
  // Disabled for now (user request) — implementation kept intact; flip
  // RECENT_ENABLED back to true to re-enable the strip + its tracking.
  const RECENT_ENABLED = false;
  const RECENT_KEY = "pcr-atb2-recent";
  const RECENT_MAX = 24;
  let recentPicks = $state([]);
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    if (Array.isArray(stored)) recentPicks = stored.slice(0, RECENT_MAX);
  } catch {}
  // Stable identity for dedupe: an item is keyed by where it lives + its tag;
  // an identity by character/cast tag (+ cast group).
  function recentKey(e) {
    return e.type === "item"
      ? `item:${e.categoryKey}:${e.groupKey}:${e.item?.item_tag}`
      : `id:${e.option?.kind}:${e.option?.group || ""}:${e.option?.tag}`;
  }
  function recordRecent(entry) {
    if (!RECENT_ENABLED) return;
    const k = recentKey(entry);
    recentPicks = [entry, ...recentPicks.filter(e => recentKey(e) !== k)].slice(0, RECENT_MAX);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recentPicks)); } catch {}
  }
  function clearRecent() {
    recentPicks = [];
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recentPicks)); } catch {}
  }

  // NSFW browse filter — hides designated NSFW groups + leaked NSFW items from
  // the picker grid/rail/search ONLY. The right-panel build state, round-trip
  // parsing, and emit are untouched, so an NSFW chip already in the build stays
  // visible and still outputs; you just can't browse-add new ones when hidden.
  const NSFW_HIDDEN_KEY = "pcr-atb2-nsfw-hidden";
  let nsfwHidden = $state(true); // default: hidden
  try { const v = localStorage.getItem(NSFW_HIDDEN_KEY); if (v !== null) nsfwHidden = v !== "0"; } catch {}
  let nsfwGroups = $state(new Set()); // "<categoryKey>/<groupKey>"
  let nsfwItems = $state(new Set());  // item_tag
  function toggleNsfw() {
    nsfwHidden = !nsfwHidden;
    // Hid NSFW while on the NSFW Actions tab → its rail entry is gone, fall back to All.
    if (nsfwHidden && activeCategory === "nsfw_action") selectCategory("all");
    try { localStorage.setItem(NSFW_HIDDEN_KEY, nsfwHidden ? "1" : "0"); } catch {}
  }
  function nsfwGroupHidden(categoryKey, groupKey) {
    return nsfwHidden && nsfwGroups.has(`${categoryKey}/${groupKey}`);
  }
  function nsfwItemHidden(item) {
    return nsfwHidden && !!item && nsfwItems.has(item.item_tag);
  }
  // The subject card's "NSFW Actions" section shows when the toggle is Shown, or
  // when the subject already has NSFW chips (so loaded content stays editable
  // even while hidden). Every other category section always shows.
  function subjNsfwSectionVisible(catKey, subj) {
    if (catKey !== "nsfw_action") return true;
    if (!nsfwHidden) return true;
    const s = subj?.slots?.nsfw_action || {};
    return Object.values(s).some(arr => arr && arr.length);
  }

  $effect(() => {
    const el = browserEl;
    if (!el) return;
    const onWheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      const step = event.deltaY < 0 ? CARD_MIN_PX_STEP : -CARD_MIN_PX_STEP;
      const next = Math.max(CARD_MIN_PX_MIN, Math.min(CARD_MIN_PX_MAX, cardMinPx + step));
      if (next === cardMinPx) return;
      cardMinPx = next;
      console.log(`[TagBuilder2] cardMinPx = ${next}px`);
      try { localStorage.setItem(CARD_MIN_PX_KEY, String(next)); } catch {}
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel, { passive: false });
  });

  // Active subitem under the Subjects rail. Drives middle-browser data
  // source (characters vs cast_items) and any filters.
  let activeSubjectSubitem = $state(null);
  // Per-category counts for the Subjects rail badges (filtered to
  // normalized characters only). Keyed by SUBJECT_SUBITEMS.filter.
  let characterCategoryCounts = $state({});

  // Cast items cache by item_group (archetype | creatures | fantasy_beings).
  // Lazy-loaded on first subitem entry, then cached for the session.
  let castCache = $state({});
  const castPromises = {};

  // Cast thumb manifest by group. Same shape as `characterThumbs` but
  // namespaced by group since each group is its own bucket on disk.
  let castThumbs = $state({});

  // Subjects array. Each subject: { id, type, name, letter, character?, slots: { categoryKey: { groupName: [items] } } }
  let subjects = $state([]);
  let activeSubjectId = $state(null);
  let nextSubjectIdx = $state(0);

  // Scene selections: { groupName: [items] }
  let sceneSelections = $state({});
  // Global scene freeform — scene-section phrases that bind to no scene chip.
  // They have no subject to live on (a prompt edited outside the regional
  // blocks may be scene-only), so they round-trip here and emit under
  // `// Scene` alongside the chips.
  let sceneFreeform = $state([]);
  // Phase 2 whole-composition edit: true when the parsed text contained
  // `$name{}` regional blocks. Each subject is bound to a block (regionName)
  // and compose re-wraps every subject in its `$name { }` so the regional
  // assignments rebuild. Off → the flat single/multi-subject output as before.
  let regionMode = $state(false);

  // Styles cache. items each have: { item_tag(=preset.id), display_name,
  // item_group(=preset.category || "Uncategorized"), tags: [...], text }.
  let stylesCache = $state({ items: [], loaded: false, loading: false });
  // Single applied style, { id, name, tags } or null. Single-select — picking
  // a different style replaces it.
  let activeStyle = $state(null);
  let styleSpawned = $state(false);
  // Scene card is opt-in. Spawned by clicking + Add Scene or by picking
  // any scene item from the middle browser. There can only be one scene.
  let sceneSpawned = $state(false);

  // Round-trip parser: set of normalized character tags so the parser
  // can recognize "cammy_white" as a character identity. Loaded once on
  // mount.
  let normalizedCharacterTags = new Set();
  // Full normalized-character records (tag, display, series, base_tags,
  // base_natlang) — used to detect natlang character prefixes during
  // round-trip parsing. Pre-sorted by base_natlang length DESC for
  // longest-prefix match.
  let normalizedCharacters = [];
  // Comments + blank lines preserved verbatim from the input prompt;
  // re-emitted at the end of composed output so they're not destroyed by
  // round-tripping. Position-aware interleaving is a follow-up.
  let preservedPassthrough = $state("");

  // Right-click context menu for marking a chip's QA status. Anchored at
  // mouse position; null = closed. The card render attaches an
  // oncontextmenu handler that opens this with the bucket+item context.
  let chipQaMenu = $state(null);  // { x, y, bucket, item }

  // Identity picker (subject-card dropdown) state. `identityPickerOpen`
  // carries the subject id whose dropdown is open; null = closed. Position
  // is fixed-relative to the trigger so it isn't clipped by the outline
  // pane's overflow.
  let identityPickerOpen = $state(null);
  let identityPickerQuery = $state("");
  let identityPickerRect = $state({ left: 0, top: 0, width: 280 });
  let identityCharResults = $state([]);
  let identityCharLoading = $state(false);
  let identityPickerHandle = null;
  let identityPickerSearchEl = null;

  // When set, the swap-confirmation modal is open. Confirm applies the
  // swap; cancel discards. Also used for rail-click swaps when the active
  // subject already has an identity.
  let pendingIdentitySwap = $state(null);

  // Outfit/Pose preset picker — single shared popover, kind switches the
  // data source and which subject field gets written. Mirror of the
  // identity picker's mechanics.
  let presetPickerOpen = $state(null);   // { kind, subjId } | null
  let presetPickerQuery = $state("");
  let presetPickerRect = $state({ left: 0, top: 0, width: 280 });
  let presetPickerResults = $state([]);
  let presetPickerLoading = $state(false);
  let presetPickerHandle = null;
  let presetPickerSearchEl = null;

  // Modifier picker — a small popover toggling MODIFIER_OPTIONS on/off
  // for the target subject. No search; the canonical list is short.
  let modifierPickerOpen = $state(null); // subjId | null
  let modifierPickerRect = $state({ left: 0, top: 0, width: 280 });

  // When a chip is click-to-jumped, this carries the target item_tag.
  // An $effect watches it, scrolls the matching card into view, and
  // briefly flashes it. Cleared after the scroll completes.
  let scrollToItemTag = $state(null);

  // Customizer modal state. `customizerOpen` carries the chip being edited:
  //   { item, subjId, catKey, grp, initial }   for an existing slot chip
  //   { item, subjId, catKey, grp, isNew: true } when first picking the chip
  // The "Apply" return goes through commitCustomizer().
  let customizerOpen = $state(null);

  // Prop customizer state. `furnitureCustomizerOpen` carries the picked
  // prop row plus the context routing decision:
  //   { item, subjId | null, sceneGroup, isNew, initial }
  // When subjId is null the result lands in sceneSelections.<category>;
  // when set the result lands in subj.slots.furniture.<category> with
  // an attached verb baked into base_tags / base_natlang. The state name
  // kept its `furniture` prefix for less churn — applies to all 16 prop
  // categories now.
  let furnitureCustomizerOpen = $state(null);
  // Full prop_actions list. The customizer filters by item.category at
  // render time using each action's compatible_categories.
  let furnitureActions = $state([]);
  let furnitureActionsLoaded = false;

  // Cache of /promptchain/clothing/customizer-data?group=... results, so
  // the round-trip prefix-peel doesn't need to refetch per token. Keyed
  // by group name. Loaded on first open + lazily by the parser.
  let clothingModData = $state({});
  const clothingModPromises = {};

  // Fantasy customizer state. `fantasyCustomizerOpen` carries the same
  // shape as `customizerOpen` so the same edit/new flow applies.
  // `fantasyModData` is { shapes, colors, types } from
  // /promptchain/fantasy/customizer-data — single endpoint, no per-group
  // partitioning, so a flat $state shared by all fantasy chips.
  let fantasyCustomizerOpen = $state(null);
  let fantasyModData = $state(null);
  let fantasyModPromise = null;

  // Appearance groups whose pick flow diverts through a modifier
  // customizer (analogous to CUSTOMIZABLE_CLOTHING_GROUPS for clothing).
  // Currently just `fantasy`.
  const CUSTOMIZABLE_APPEARANCE_GROUPS = new Set(["fantasy"]);

  // ----------------------------------------------------------------------
  //  DERIVED
  // ----------------------------------------------------------------------

  let activeCategoryDef = $derived(CATEGORIES.find(c => c.key === activeCategory) || CATEGORIES[0]);

  // Rail + onMount prefetch use this so the NSFW Actions category only appears
  // when the NSFW toggle is Shown. `.find()` lookups elsewhere stay on
  // CATEGORIES, so an already-active nsfw_action view still resolves its def and
  // already-added NSFW chips still render/emit via slotCategories.
  let effectiveCategories = $derived(
    nsfwHidden ? CATEGORIES.filter(c => c.key !== "nsfw_action") : CATEGORIES
  );
  let activeBucket = $derived(activeCategoryDef.bucket);
  let activeBucketData = $derived(bucketCache[activeBucket] || { groups: [], items: [], thumbs: new Set(), loading: true });
  let activeSubject = $derived(subjects.find(s => s.id === activeSubjectId) || null);

  let routingTarget = $derived.by(() => {
    if (activeCategoryDef.scope === "all") return { type: "all", label: "All categories" };
    if (activeCategoryDef.scope === "global") return { type: "scene", label: "Scene" };
    if (activeCategoryDef.scope === "furniture") {
      if (activeSubject) return { type: "subject-furniture", label: `${activeSubject.name} (prop interaction)` };
      return { type: "scene-furniture", label: "Scene" };
    }
    if (activeCategoryDef.scope === "style") return { type: "style", label: "Style" };
    if (activeCategoryDef.scope === "spawn") {
      if (activeSubject?.character) {
        return { type: "rebind", label: `${activeSubject.name} (will prompt to swap)` };
      }
      if (activeSubject) {
        return { type: "bind", label: `${activeSubject.name} (will bind identity)` };
      }
      return { type: "spawn", label: "(spawns new subject on click)" };
    }
    if (activeSubject) return { type: "subject", id: activeSubject.id, label: activeSubject.name };
    const nextLetter = SUBJECT_LETTERS[nextSubjectIdx % 26] || "?";
    return { type: "auto", label: `(auto-spawn Subject ${nextLetter})` };
  });

  let itemsByGroup = $derived.by(() => {
    const source = activeCategory === "styles" ? stylesCache.items : activeBucketData.items;
    const map = {};
    for (const it of source) {
      if (!map[it.item_group]) map[it.item_group] = [];
      map[it.item_group].push(it);
    }
    return map;
  });

  // All-view sections — one per category/group, plus the synthetic
  // Modifiers section under Appearance. Search query filters items in
  // each section; sections with no matches are hidden.
  let allCategorySections = $derived.by(() => {
    if (activeCategory !== "all") return [];
    const q = debouncedQuery.trim().toLowerCase().replace(/[_\s]+/g, " ");
    const filterFn = (it) => {
      if (!q) return true;
      const d = (it.display_name || it.item_tag || "").toLowerCase().replace(/[_\s]+/g, " ");
      const t = (it.base_tags || "").toLowerCase().replace(/[_\s]+/g, " ");
      return d.includes(q) || t.includes(q);
    };
    const sections = [];

    // Subjects > Characters first — these are spawn-on-click, identified
    // by `kind: "subject-character"` so the click handler routes through
    // pickIdentityFromBrowser instead of toggleInBag.
    if (characters.length) {
      sections.push({
        key: "subjects/characters",
        kind: "subject-character",
        categoryKey: "subjects",
        categoryLabel: "Subjects",
        groupLabel: "Characters",
        items: characters.map(c => ({ ...c, item_tag: c.tag, display_name: c.display })),
      });
    }
    // Subjects > each cast group (Archetype / Creatures / Fantasy).
    for (const sub of SUBJECT_SUBITEMS) {
      if (sub.source !== "cast") continue;
      const items = (castCache[sub.filter]?.items || []).filter(filterFn);
      if (items.length) {
        sections.push({
          key: `subjects/${sub.filter}`,
          kind: "subject-cast",
          castGroup: sub.filter,
          categoryKey: "subjects",
          categoryLabel: "Subjects",
          groupLabel: sub.label,
          items,
        });
      }
    }

    for (const cat of CATEGORIES) {
      if (!cat.enabled) continue;
      if (cat.key === "nsfw_action") continue; // explicit bucket lives only in its own tab, never in "All"
      if (cat.scope === "all" || cat.scope === "spawn" || cat.scope === "style") continue;
      if (!cat.bucket) continue;
      const data = bucketCache[cat.bucket];
      if (!data?.loaded) continue;
      const groups = data.groups || [];
      for (const g of groups) {
        if (nsfwGroupHidden(cat.key, g.group_name)) continue;
        const items = (data.items || []).filter(it => it.item_group === g.group_name).filter(filterFn).filter(it => !nsfwItemHidden(it));
        if (items.length) {
          sections.push({
            key: `${cat.key}/${g.group_name}`,
            categoryKey: cat.key,
            categoryLabel: cat.label,
            groupLabel: g.display_name || g.group_name,
            groupKey: g.group_name,
            items,
          });
        }
      }
      if (cat.key === "appearance") {
        const modItems = MODIFIER_ITEMS.filter(filterFn).filter(it => !nsfwItemHidden(it));
        if (modItems.length) {
          sections.push({
            key: "appearance/__modifiers__",
            categoryKey: "appearance",
            categoryLabel: "Appearance",
            groupLabel: "Modifiers",
            groupKey: MODIFIER_GROUP_KEY,
            items: modItems,
          });
        }
      }
    }
    return sections;
  });

  // For category views with no specific group selected, group cards under
  // their item_group sub-headers so users see the structure of the category.
  let groupedSections = $derived.by(() => {
    if (activeCategory === "all" || activeCategory === "subjects" || activeCategory === "styles") return null;
    if (activeGroup) return null;
    if (!activeBucket) return null;
    const data = bucketCache[activeBucket];
    if (!data?.loaded) return null;
    const groups = data.groups || [];
    if (groups.length <= 1) return null;
    const q = debouncedQuery.trim().toLowerCase().replace(/[_\s]+/g, " ");
    const filterFn = (it) => {
      if (!q) return true;
      const d = (it.display_name || it.item_tag || "").toLowerCase().replace(/[_\s]+/g, " ");
      const t = (it.base_tags || "").toLowerCase().replace(/[_\s]+/g, " ");
      return d.includes(q) || t.includes(q);
    };
    const sections = [];
    for (const g of groups) {
      if (nsfwGroupHidden(activeCategory, g.group_name)) continue;
      const items = (data.items || []).filter(it => it.item_group === g.group_name).filter(filterFn).filter(it => !nsfwItemHidden(it));
      if (items.length) {
        sections.push({
          key: g.group_name,
          groupLabel: g.display_name || g.group_name,
          groupKey: g.group_name,
          items,
        });
      }
    }
    return sections;
  });

  let visibleItems = $derived.by(() => {
    const q = debouncedQuery.trim().toLowerCase().replace(/[_\s]+/g, " ");
    if (nsfwGroupHidden(activeCategory, activeGroup)) return [];
    // Appearance > Modifiers sub-item: render the synthetic modifier list.
    if (activeCategory === "appearance" && activeGroup === MODIFIER_GROUP_KEY) {
      if (!q) return MODIFIER_ITEMS;
      return MODIFIER_ITEMS.filter(it => {
        const d = (it.display_name || it.item_tag || "").toLowerCase().replace(/[_\s]+/g, " ");
        const t = (it.item_tag || "").toLowerCase().replace(/[_\s]+/g, " ");
        return d.includes(q) || t.includes(q);
      });
    }
    if (activeCategory === "styles") {
      const pool = activeGroup ? (itemsByGroup[activeGroup] || []) : stylesCache.items;
      if (!q) return pool;
      return pool.filter(it => {
        const d = (it.display_name || "").toLowerCase().replace(/[_\s]+/g, " ");
        const t = (it.tags || []).join(" ").toLowerCase().replace(/[_\s]+/g, " ");
        return d.includes(q) || t.includes(q);
      });
    }
    const pool = (activeGroup ? (itemsByGroup[activeGroup] || []) : activeBucketData.items).filter(it => !nsfwItemHidden(it));
    if (!q) return pool;
    return pool.filter(it => {
      const d = (it.display_name || it.item_tag || "").toLowerCase().replace(/[_\s]+/g, " ");
      const t = (it.base_tags || "").toLowerCase().replace(/[_\s]+/g, " ");
      return d.includes(q) || t.includes(q);
    });
  });

  let sceneGroupsList = $derived(bucketCache.scene?.groups || []);

  let searchPlaceholder = $derived.by(() => {
    if (activeCategory === "subjects") {
      const sub = SUBJECT_SUBITEMS.find(s => s.key === activeSubjectSubitem);
      if (sub) return `Search ${sub.label.toLowerCase()}…`;
      return "Pick a subject type…";
    }
    return `Search ${activeCategoryDef.label.toLowerCase()}…`;
  });

  // Reverse index: every loaded item_tag → { bucket, group, item }. Used by
  // the character base_tags parser to resolve tokens into typed chips.
  // First-write-wins so a tag that appears in multiple buckets resolves to
  // the first-loaded one.
  let tagToItem = $derived.by(() => {
    const map = new Map();
    // Iterate buckets in a fixed priority order so cross-bucket
    // item_tag/base_tags collisions resolve deterministically. Character
    // base parsing pulls appearance-bucket tokens (1girl, glasses,
    // hair_ribbon, etc.) — those have to win over clothing duplicates,
    // otherwise the chip lands in a clothing slot and the character
    // override never fires.
    const BUCKET_PRIORITY = ["appearance", "pose", "scene", "clothing", "style"];
    const orderedEntries = Object.entries(bucketCache).sort(([a], [b]) => {
      const ai = BUCKET_PRIORITY.indexOf(a);
      const bi = BUCKET_PRIORITY.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    for (const [bucket, data] of orderedEntries) {
      if (!data?.items) continue;
      // Pass 1: index by item_tag.
      for (const item of data.items) {
        if (!map.has(item.item_tag)) {
          map.set(item.item_tag, { bucket, group: item.item_group, item });
        }
      }
      // Pass 2: index by single-token base_tags so prefixed rows are
      // findable by the canonical Danbooru tag (e.g.
      // headwear_garrison_cap.base_tags = "garrison_cap").
      for (const item of data.items) {
        const bt = (item.base_tags || "").trim();
        if (!bt || bt.includes(",") || bt.startsWith("(")) continue;
        if (!map.has(bt)) {
          map.set(bt, { bucket, group: item.item_group, item });
        }
      }
    }
    return map;
  });

  let totalSelectionCount = $derived.by(() => {
    let n = 0;
    for (const arr of Object.values(sceneSelections)) n += arr?.length || 0;
    if (activeStyle?.tags?.length) n += 1;
    for (const subj of subjects) {
      if (subj.character) n += 1;
      n += (subj.identityTokens || []).length;
      n += (subj.modifiers || []).length;
      n += (subj.freeform || []).length;
      for (const cat of Object.values(subj.slots || {})) {
        for (const arr of Object.values(cat || {})) n += arr?.length || 0;
      }
    }
    return n;
  });

  // ----------------------------------------------------------------------
  //  LIFECYCLE
  // ----------------------------------------------------------------------

  $effect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // Lazy-load the active bucket on demand. Prefetch scene + appearance
  // up-front since both are likely to be touched.
  $effect(() => {
    const bucket = activeBucket;
    if (bucket && !bucketCache[bucket]?.loaded && !bucketCache[bucket]?.loading) {
      loadBucket(bucket);
    }
  });

  // Subjects rail: fetch source data when entering a subitem or when the
  // search query changes. activeSubjectSubitem === null means "All" — load
  // characters with no category filter. Specific subitems either filter
  // characters by category or load a cast item group.
  $effect(() => {
    if (activeCategory !== "subjects" && activeCategory !== "all") return;
    const q = searchQuery;
    if (activeCategory === "all" || !activeSubjectSubitem) {
      if (charactersSearchHandle) clearTimeout(charactersSearchHandle);
      charactersSearchHandle = setTimeout(() => loadCharacters(q, ""), 200);
      return;
    }
    const sub = SUBJECT_SUBITEMS.find(s => s.key === activeSubjectSubitem);
    if (!sub) return;
    if (sub.source === "characters") {
      if (charactersSearchHandle) clearTimeout(charactersSearchHandle);
      charactersSearchHandle = setTimeout(() => loadCharacters(q, sub.filter), 200);
    } else if (sub.source === "cast") {
      loadCast(sub.filter);
    }
  });

  onMount(async () => {
    // Prefetch all enabled buckets so the character base_tags parser can
    // resolve tokens across categories without a load race.
    for (const cat of CATEGORIES) {
      if (cat.enabled && cat.bucket) loadBucket(cat.bucket);
    }

    // Preload normalized characters (tag + base_natlang etc.) so the
    // round-trip parser can recognize both tag-form ("cammy_white") and
    // natlang ("Cammy White from Street Fighter.") character identities.
    const charTagsPromise = fetch(`/promptchain/tag-builder/characters/identity-index`)
      .then(r => r.ok ? r.json() : { characters: [] })
      .then(d => {
        const chars = d.characters || [];
        normalizedCharacterTags = new Set(chars.map(c => c.tag));
        // Sort by base_natlang length DESC so longest-prefix match wins.
        normalizedCharacters = chars
          .filter(c => c.base_natlang && c.base_natlang.trim())
          .sort((a, b) => (b.base_natlang || "").length - (a.base_natlang || "").length);
      })
      .catch(() => {});

    // Round-trip: if invoked on existing prompt text, parse it into the
    // right-panel state. Wait for buckets + character tags + styles first
    // so tagToItem, normalizedCharacterTags, and stylesCache are populated.
    if (initialText && initialText.trim()) {
      Promise.all([
        charTagsPromise,
        ensureSubjectBucketsLoaded(),
        loadStyles(),
        // Furniture isn't a subject-scope bucket, so ensureSubjectBucketsLoaded
        // skips it. Round-trip parsing needs furniture items + prop_actions
        // available to recognize phrases like "sitting on a wooden chair"
        // and bind them as furniture chips instead of section freeform.
        loadFurniture(),
        // Cast groups must be loaded too so buildCastIdentityMap can rebind
        // archetype identities ("motherly" → archetype_motherly) instead of
        // racing and dropping them to freeform.
        ...SUBJECT_SUBITEMS.filter(s => s.source === "cast").map(s => loadCast(s.filter)),
      ]).then(() => parseInitialPrompt(initialText)).catch(e => {
        console.error("[TagBuilder2] round-trip parse failed", e);
      });
    }
    // Preload all cast groups so the identity dropdown's local filter has
    // them available the first time it opens.
    for (const sub of SUBJECT_SUBITEMS) {
      if (sub.source === "cast") loadCast(sub.filter);
    }
    // Also fetch which characters have portrait thumbs available.
    fetch(`/promptchain/tag-builder/thumbs/manifest?bucket=characters`)
      .then(r => r.ok ? r.json() : { thumbs: [] })
      .then(d => { characterThumbs = new Set(d.thumbs || []); })
      .catch(() => {});
    // Per-category character counts for the Subjects rail.
    fetch(`/promptchain/tag-builder/character-counts?natlang_status=normalized`)
      .then(r => r.ok ? r.json() : { counts: {} })
      .then(d => { characterCategoryCounts = d.counts || {}; })
      .catch(() => {});
    // NSFW browse-filter manifest (groups hidden wholesale + leaked item tags).
    fetch(`/promptchain/tag-builder/nsfw-manifest`)
      .then(r => r.ok ? r.json() : { groups: [], items: [] })
      .then(d => { nsfwGroups = new Set(d.groups || []); nsfwItems = new Set(d.items || []); })
      .catch(() => {});
    // Same for each cast group — bucket name on disk matches the group.
    for (const sub of SUBJECT_SUBITEMS) {
      if (sub.source !== "cast") continue;
      const group = sub.filter;
      fetch(`/promptchain/tag-builder/thumbs/manifest?bucket=${encodeURIComponent(group)}`)
        .then(r => r.ok ? r.json() : { thumbs: [] })
        .then(d => { castThumbs = { ...castThumbs, [group]: new Set(d.thumbs || []) }; })
        .catch(() => {});
    }
  });

  // ----------------------------------------------------------------------
  //  STYLES — model-scoped prompt presets. A preset carries its positive
  //  tags plus (optionally) its own `// Header` line and a Negative Prompt:
  //  block, all of which we round-trip verbatim.
  // ----------------------------------------------------------------------

  function extractStyleTags(text) {
    if (!text) return [];
    const lines = text.split("\n");
    const cursorIdx = lines.findIndex(l => l.includes("{cursor}"));
    const startIdx = cursorIdx >= 0 ? cursorIdx + 1 : 0;
    const out = [];
    for (let i = startIdx; i < lines.length; i++) {
      if (isStructuralLine(lines[i])) continue;
      if (isInNegativeBlock(lines, i)) continue;
      // Split on `,` AND sentence boundaries so tokenization aligns with
      // the prompt-input stream (which also splits on `. `). Without
      // matching splits, content-based style detection fails on presets
      // whose tag prose contains periods.
      for (const piece of lines[i].split(/,|\.\s+/)) {
        const t = piece.trim().replace(/\.$/, "");
        if (t) out.push(t);
      }
    }
    return out;
  }

  // The `// ...` header that introduces the preset's positive tags (the
  // first comment line after `{cursor}`), e.g. `// Figurine Default`. Null
  // when the preset has no header of its own — pick falls back to a
  // synthetic `// Style: <name>` then.
  function extractStyleHeader(text) {
    if (!text) return null;
    const lines = text.split("\n");
    const cursorIdx = lines.findIndex(l => l.includes("{cursor}"));
    for (let i = (cursorIdx >= 0 ? cursorIdx + 1 : 0); i < lines.length; i++) {
      const t = lines[i].trim();
      if (!t) continue;
      return /^\/\//.test(t) ? t : null; // first non-blank: header, or content (no header)
    }
    return null;
  }

  // The preset's Negative Prompt: body (lines after the marker, up to the
  // first trailing blank), or null. Carried on the style so picking it
  // inserts the negative and round-trips bind it back to the style.
  function extractStyleNegative(text) {
    if (!text) return null;
    const lines = text.split("\n");
    const negIdx = lines.findIndex(l => /^Negative Prompt:\s*$/i.test(l.trim()));
    if (negIdx < 0) return null;
    const body = [];
    for (let i = negIdx + 1; i < lines.length; i++) {
      if (!lines[i].trim()) { if (body.length) break; else continue; }
      body.push(lines[i].trim());
    }
    return body.length ? body.join("\n") : null;
  }

  function presetToStyleItem(preset) {
    const tags = extractStyleTags(preset.text || "");
    if (!tags.length) return null;
    return {
      item_tag: preset.id || preset.name,
      display_name: preset.name || preset.id,
      item_group: preset.category || "Uncategorized",
      tags,
      header: extractStyleHeader(preset.text || ""),
      negative: extractStyleNegative(preset.text || ""),
      _text: preset.text || "",
    };
  }

  async function loadStyles() {
    if (stylesCache.loaded || stylesCache.loading) return;
    stylesCache = { ...stylesCache, loading: true };
    try {
      const params = new URLSearchParams();
      if (modelInfo?.hash) params.set("hash", modelInfo.hash);
      if (modelInfo?.filename) params.set("name", modelInfo.filename);
      if (modelInfo?.architecture) params.set("arch", modelInfo.architecture);
      if (modelInfo?.family) params.set("family", modelInfo.family);
      const res = await fetch(`/promptchain/prompts/list?${params}`);
      const data = res.ok ? await res.json() : { prompts: [] };
      const items = (data.prompts || []).map(presetToStyleItem).filter(Boolean);
      stylesCache = { items, loaded: true, loading: false };
      console.log(`[TagBuilder2] loadStyles: ${items.length} presets (modelInfo: ${modelInfo ? `arch=${modelInfo.architecture} fam=${modelInfo.family} hash=${modelInfo.hash?.slice(0,8)}` : "null"})`);
    } catch (e) {
      console.error("[TagBuilder2] styles fetch failed", e);
      stylesCache = { items: [], loaded: true, loading: false };
    }
  }

  $effect(() => {
    if (activeCategory === "styles" && !stylesCache.loaded && !stylesCache.loading) {
      loadStyles();
    }
  });

  // Distinct categories present in the loaded styles, sorted by count desc.
  let styleGroups = $derived.by(() => {
    const counts = new Map();
    for (const it of stylesCache.items) {
      counts.set(it.item_group, (counts.get(it.item_group) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([group_name]) => ({ group_name, display_name: group_name }));
  });

  function pickStyle(item) {
    // Single-select. Picking the active style toggles it off.
    if (activeStyle?.id === item.item_tag) {
      activeStyle = null;
      return;
    }
    activeStyle = {
      id: item.item_tag,
      name: item.display_name,
      tags: [...item.tags],
      // Prefer the preset's own header (e.g. `// Figurine Default`); only
      // synthesize `// Style: <name>` when the preset carries none. Round-trip
      // parse overwrites this with the user's actual header text when re-binding.
      commentHeader: item.header || `// Style: ${item.display_name}`,
      // Insert the preset's negative alongside its positives. Null when the
      // preset has none. Round-trip moves the user's negative here instead.
      negative: item.negative || null,
    };
    if (!styleSpawned) styleSpawned = true;
  }

  function clearStyle() {
    activeStyle = null;
  }

  function deleteStyleCard() {
    activeStyle = null;
    styleSpawned = false;
  }

  async function fetchCharacterPage(page) {
    // Sort by post_count for relevance — popular characters surface first.
    const params = new URLSearchParams({ page: String(page), per_page: "60", sort: "post_count" });
    if (charactersQuery) params.set("search", charactersQuery);
    if (charactersCategory) params.set("category", charactersCategory);
    // Only show characters whose natlangs have been curated.
    params.set("natlang_status", "normalized");
    const res = await fetch(`/promptchain/tag-builder/characters?${params}`);
    if (!res.ok) throw new Error("character fetch failed");
    return res.json();
  }

  async function loadCharacters(query, category) {
    charactersQuery = query || "";
    charactersCategory = category || "";
    charactersPage = 1;
    charactersLoading = true;
    try {
      const data = await fetchCharacterPage(1);
      characters = data.characters || [];
      charactersTotal = data.total || 0;
    } catch (e) {
      console.error("[TagBuilder2] character fetch failed", e);
      characters = [];
      charactersTotal = 0;
    }
    charactersLoading = false;
  }

  // Append the next character page (infinite scroll). Re-entry guarded; stops
  // once every matching row is loaded. Dedups by tag in case pages overlap.
  async function loadMoreCharacters() {
    if (charactersLoadingMore || charactersLoading) return;
    if (characters.length >= charactersTotal) return;
    charactersLoadingMore = true;
    try {
      const data = await fetchCharacterPage(charactersPage + 1);
      const more = data.characters || [];
      if (more.length) {
        const seen = new Set(characters.map(c => c.tag));
        characters = [...characters, ...more.filter(c => !seen.has(c.tag))];
        charactersPage += 1;
      }
      charactersTotal = data.total ?? charactersTotal;
    } catch (e) {
      console.error("[TagBuilder2] character load-more failed", e);
    }
    charactersLoadingMore = false;
  }

  // Svelte action: load the next character page when this sentinel scrolls
  // near the bottom of the browser pane, so the rail fills on scroll (and
  // auto-fills the next page when the first doesn't fill the viewport).
  function characterLoadMore(node) {
    const root = node.closest(".pcr-atb2-browser");
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMoreCharacters();
    }, { root: root || null, rootMargin: "300px" });
    io.observe(node);
    return { destroy() { io.disconnect(); } };
  }

  function loadCast(group) {
    if (castCache[group]?.loaded) return Promise.resolve();
    if (castPromises[group]) return castPromises[group];
    castCache = { ...castCache, [group]: { items: [], loaded: false, loading: true } };
    castPromises[group] = (async () => {
      try {
        const res = await fetch(`/promptchain/tag-builder/cast?group=${encodeURIComponent(group)}`);
        const data = res.ok ? await res.json() : { items: [] };
        castCache = { ...castCache, [group]: { items: data.items || [], loaded: true, loading: false } };
      } catch (e) {
        console.error(`[TagBuilder2] cast fetch failed: ${group}`, e);
        castCache = { ...castCache, [group]: { items: [], loaded: true, loading: false, error: true } };
      } finally {
        delete castPromises[group];
      }
    })();
    return castPromises[group];
  }

  // Idempotent loader. Returns a promise that resolves once the bucket data
  // is available — second/third calls reuse the in-flight promise instead
  // of refetching, and a no-op for already-loaded buckets.
  const bucketPromises = {};
  function loadBucket(bucket) {
    if (bucketCache[bucket]?.loaded) return Promise.resolve();
    if (bucketPromises[bucket]) return bucketPromises[bucket];

    // Props isn't a real bucket on the backend (different table schema +
    // its own /promptchain/props/* endpoints), so route to the dedicated
    // loader and shape its result to match the bucketCache contract so all
    // downstream rendering (rail counts, grouped sections, slot iteration)
    // works without further branching. Bucket name kept as "furniture" for
    // historical continuity — the data now covers all 16 prop categories.
    if (bucket === "furniture") return loadFurniture();

    bucketCache = { ...bucketCache, [bucket]: { groups: [], items: [], thumbs: new Set(), loaded: false, loading: true } };

    bucketPromises[bucket] = (async () => {
      try {
        const [gRes, iRes, mRes] = await Promise.all([
          fetch(`/promptchain/tag-builder/buckets/${bucket}/groups`),
          fetch(`/promptchain/tag-builder/buckets/${bucket}/items`),
          fetch(`/promptchain/tag-builder/thumbs/manifest?bucket=${bucket}`),
        ]);
        const groups = gRes.ok ? (await gRes.json()).groups || [] : [];
        const items = iRes.ok ? (await iRes.json()).items || [] : [];
        const thumbs = mRes.ok ? new Set((await mRes.json()).thumbs || []) : new Set();
        bucketCache = { ...bucketCache, [bucket]: { groups, items, thumbs, loaded: true, loading: false } };
      } catch (e) {
        console.error(`[TagBuilder2] bucket fetch failed: ${bucket}`, e);
        bucketCache = { ...bucketCache, [bucket]: { groups: [], items: [], thumbs: new Set(), loaded: true, loading: false, error: true } };
      } finally {
        delete bucketPromises[bucket];
      }
    })();
    return bucketPromises[bucket];
  }

  // Props loader. Pulls the unified /promptchain/props/all bundle (props,
  // categories, actions, materials, patterns, colors, action_overrides) and
  // maps it into the bucketCache shape: items grouped by item_group (=
  // prop category like "furniture"/"weapons"/"food"). The legacy
  // /promptchain/furniture endpoint is still queried for the per-item
  // sub-category (seating/sleeping/etc.) — material compat in
  // furniture_materials.compatible_categories references those sub-keys,
  // so we stash them on furniture-category items as `subCategory`.
  function loadFurniture() {
    if (bucketCache.furniture?.loaded) return Promise.resolve();
    if (bucketPromises.furniture) return bucketPromises.furniture;
    bucketCache = { ...bucketCache, furniture: { groups: [], items: [], thumbs: new Set(), loaded: false, loading: true } };

    bucketPromises.furniture = (async () => {
      try {
        const [allRes, furnRes, thumbRes] = await Promise.all([
          fetch("/promptchain/props/all"),
          fetch("/promptchain/furniture"),
          // Props/furniture thumbs live on disk under the "furniture"
          // bucket segment (all 16 prop categories share it). Without this
          // manifest the thumbs Set stays empty and no prop card shows art.
          fetch("/promptchain/tag-builder/thumbs/manifest?bucket=furniture"),
        ]);
        const all = allRes.ok ? await allRes.json() : {
          categories: [], props: [], actions: [],
          materials: [], patterns: [], colors: [], action_overrides: {},
        };
        const furnRows = furnRes.ok ? await furnRes.json() : [];
        const furnThumbs = thumbRes.ok ? new Set((await thumbRes.json()).thumbs || []) : new Set();

        // Full action list — the customizer filters per item.category using
        // compatible_categories at render time.
        furnitureActions = all.actions || [];
        furnitureActionsLoaded = true;

        // Rail / browser group order comes from prop_category_meta. Each
        // entry already carries its emoji + display label.
        const groups = (all.categories || []).map(c => ({
          group_name: c.category,
          display_name: c.display_name || (c.category.charAt(0).toUpperCase() + c.category.slice(1)),
          icon: c.icon || "",
          sort_order: c.sort_order,
        }));

        // Sub-category lookup for furniture-category items only. The
        // legacy furniture table's `category` column carries the
        // seating/sleeping/etc. taxonomy that furniture_materials joins
        // against. Other prop categories have no sub-grouping.
        const furnSubCat = new Map();
        for (const row of furnRows) furnSubCat.set(row.tag, row.category);

        const items = (all.props || []).map(row => ({
          item_tag: row.prop_tag,
          display_name: row.display_name,
          item_group: row.category,
          base_tags: row.base_tags || row.prop_tag,
          base_natlang: row.base_natlang || (row.display_name || "").toLowerCase(),
          sort_order: row.sort_order,
          is_customizable: !!row.is_customizable,
          subCategory: row.category === "furniture" ? (furnSubCat.get(row.prop_tag) || null) : null,
        }));

        bucketCache = {
          ...bucketCache,
          furniture: {
            groups,
            items,
            thumbs: furnThumbs,
            loaded: true,
            loading: false,
            // Sidecar data used by the customizer; not consumed by the
            // generic rail/browser rendering. action_overrides keyed by
            // prop_tag lets the customizer prefer per-prop verb lists when
            // present (e.g. a sword's overrides narrow to wielding/aiming).
            mods: {
              materials: all.materials || [],
              patterns: all.patterns || [],
              colors: all.colors || [],
              actionOverrides: all.action_overrides || {},
            },
          },
        };
      } catch (e) {
        console.error("[TagBuilder2] props fetch failed", e);
        bucketCache = { ...bucketCache, furniture: { groups: [], items: [], thumbs: new Set(), loaded: true, loading: false, error: true } };
      } finally {
        delete bucketPromises.furniture;
      }
    })();
    return bucketPromises.furniture;
  }

  // ----------------------------------------------------------------------
  //  CHIP QA STATUS
  // ----------------------------------------------------------------------

  // Red outline marks chips actively flagged as 'broken' — bad natlang
  // content the user (or a heuristic pass) has called out. 'unprocessed'
  // is neutral (untested, not necessarily bad) so the field isn't a wall
  // of red on fresh installs. 'normalized' = verified-ready.
  function isItemUnprocessed(item) {
    if (!item) return false;
    return (item.natlang_status ?? "") === "broken";
  }

  function openChipQaMenu(e, bucket, item) {
    if (!bucket || !item) return;
    e.preventDefault();
    e.stopPropagation();
    chipQaMenu = { x: e.clientX, y: e.clientY, bucket, item };
  }

  function closeChipQaMenu() { chipQaMenu = null; }

  async function setChipNatlangStatus(bucket, item, status) {
    closeChipQaMenu();
    try {
      const res = await fetch(
        `/promptchain/tag-builder/buckets/${bucket}/items/${encodeURIComponent(item.item_tag)}/natlang-status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      if (!res.ok) {
        console.error(`[TagBuilder2] natlang_status update failed: ${res.status}`);
        return;
      }
    } catch (err) {
      console.error("[TagBuilder2] natlang_status update error", err);
      return;
    }
    // Propagate the new status to every in-memory reference so the
    // outline drops immediately without a refetch. Subject slot chips
    // and scene selections hold copies spread from the bucketCache row,
    // so they need updating in parallel.
    const items = bucketCache[bucket]?.items;
    if (items) {
      const row = items.find(r => r.item_tag === item.item_tag);
      if (row) row.natlang_status = status;
    }
    for (const subj of subjects) {
      for (const catKey of Object.keys(subj.slots || {})) {
        for (const grp of Object.keys(subj.slots[catKey] || {})) {
          for (const chip of subj.slots[catKey][grp]) {
            if (chip.item_tag === item.item_tag) chip.natlang_status = status;
          }
        }
      }
    }
    for (const grp of Object.keys(sceneSelections || {})) {
      for (const chip of sceneSelections[grp] || []) {
        if (chip.item_tag === item.item_tag) chip.natlang_status = status;
      }
    }
    bucketCache = { ...bucketCache };
    subjects = [...subjects];
    sceneSelections = { ...sceneSelections };
  }

  // ----------------------------------------------------------------------
  //  THUMBS
  // ----------------------------------------------------------------------

  function thumbUrl(bucket, itemTag) {
    return `/promptchain/tag-builder/thumb/${bucket}/${encodeURIComponent(itemTag)}`;
  }

  function hasThumb(bucket, itemTag) {
    return bucketCache[bucket]?.thumbs?.has(itemTag);
  }

  // Svelte action for sticky section headers: watches a sentinel at the
  // section's top edge and toggles `pcr-atb2-section-stuck` on the header
  // only while it's pinned to the viewport top, so the drop shadow shows
  // when stuck rather than permanently. The sentinel is a sibling element
  // rendered by Svelte; we look it up rather than inject one.
  function stickyShadow(headerEl) {
    const root = headerEl.closest(".pcr-atb2-browser");
    const sentinel = headerEl.parentElement?.querySelector(".pcr-atb2-section-sentinel");
    if (!root || !sentinel) return;
    const io = new IntersectionObserver(([entry]) => {
      const stuck = !entry.isIntersecting
        && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0);
      headerEl.classList.toggle("pcr-atb2-section-stuck", stuck);
    }, { root, threshold: 0 });
    io.observe(sentinel);
    return { destroy() { io.disconnect(); } };
  }

  // Scroll-spy for the grouped category view (Clothing, Appearance, …):
  // highlights the rail row for whichever section is at the top of the
  // browser, and clicking a rail row jumps to that section. Sections tile
  // contiguously, so observing them against a thin top band yields a discrete
  // IntersectionObserver event right at each hand-off — no scroll polling.
  let scrollSpyGroup = $state(null);
  const _spyNodes = new Set();
  const _spyVisible = new Set();
  let _spyObserver = null;

  function _recomputeSpy(root) {
    if (!_spyVisible.size) return;
    const rootTop = root.getBoundingClientRect().top;
    let atTop = null, atTopOffset = -Infinity;
    let topmost = null, topmostOffset = Infinity;
    for (const node of _spyVisible) {
      const offset = node.getBoundingClientRect().top - rootTop;
      if (offset <= 4 && offset > atTopOffset) { atTopOffset = offset; atTop = node; }
      if (offset < topmostOffset) { topmostOffset = offset; topmost = node; }
    }
    const winner = atTop ?? topmost;
    if (winner) scrollSpyGroup = winner.dataset.spyGroup;
  }

  $effect(() => {
    const root = browserEl;
    if (!root) return;
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) _spyVisible.add(entry.target);
        else _spyVisible.delete(entry.target);
      }
      _recomputeSpy(root);
    }, { root, rootMargin: "0px 0px -85% 0px", threshold: 0 });
    _spyObserver = io;
    for (const node of _spyNodes) io.observe(node);
    return () => { io.disconnect(); _spyObserver = null; _spyVisible.clear(); };
  });

  // Clear the highlight on category switch so a stale group doesn't linger
  // until the observer re-fires for the new section set.
  $effect(() => { activeCategory; scrollSpyGroup = null; });

  // In the "all" view the spy key is the composite section key
  // ("appearance/hair_color"); the leading segment tells the rail which
  // category to auto-expand as you scroll across category boundaries.
  let scrollSpyCategory = $derived(
    activeCategory === "all" && typeof scrollSpyGroup === "string" && scrollSpyGroup.includes("/")
      ? scrollSpyGroup.slice(0, scrollSpyGroup.indexOf("/"))
      : null
  );

  // Keep the highlighted rail row visible as the spy moves — the "how deep
  // am I" cue. block:nearest only scrolls the rail when the row would
  // actually leave view, so it doesn't thrash at every hand-off.
  $effect(() => {
    scrollSpyGroup; // re-run when the active section changes
    if (activeCategory !== "all") return;
    const row = railEl?.querySelector(".pcr-atb2-rail-drilldown .pcr-atb2-rail-sub.active");
    row?.scrollIntoView({ block: "nearest" });
  });

  function spyTarget(node) {
    _spyNodes.add(node);
    _spyObserver?.observe(node);
    return {
      destroy() {
        _spyNodes.delete(node);
        _spyVisible.delete(node);
        _spyObserver?.unobserve(node);
      },
    };
  }

  async function scrollToGroup(group) {
    if (activeGroup !== null) activeGroup = null;
    await tick();
    const root = browserEl;
    if (!root) return;
    const section = root.querySelector(
      `.pcr-atb2-browser-section[data-spy-group="${CSS.escape(group)}"]`
    );
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // All-view jump: sections there are keyed by the full composite
  // ("appearance/hair_color"), so match on that directly.
  function scrollToAllSection(sectionKey) {
    const root = browserEl;
    if (!root) return;
    const section = root.querySelector(
      `.pcr-atb2-browser-section[data-spy-group="${CSS.escape(sectionKey)}"]`
    );
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ----------------------------------------------------------------------
  //  RAIL / GROUP SELECTION
  // ----------------------------------------------------------------------

  // Reset the browser scroll to the top after a category/group switch —
  // otherwise the new list renders at the previous category's scroll
  // offset, dropping the user into the middle of it.
  async function scrollBrowserTop() {
    await tick();
    if (browserEl) browserEl.scrollTop = 0;
  }

  // Re-pull a bucket's thumb manifest and merge it into the cached set.
  // Bucket loaders fetch the manifest once at load, so thumbs added later
  // in the session wouldn't appear without a full page reload — refreshing
  // on category open keeps the bulk-thumbnail workflow live.
  async function refreshThumbs(bucket) {
    if (!bucket || !bucketCache[bucket]?.loaded) return;
    try {
      const res = await fetch(`/promptchain/tag-builder/thumbs/manifest?bucket=${encodeURIComponent(bucket)}`);
      if (!res.ok) return;
      const thumbs = new Set((await res.json()).thumbs || []);
      bucketCache = { ...bucketCache, [bucket]: { ...bucketCache[bucket], thumbs } };
    } catch {}
  }

  function selectCategory(key) {
    const cat = CATEGORIES.find(c => c.key === key);
    if (!cat || !cat.enabled) return;
    if (key !== activeCategory) { searchQuery = ""; debouncedQuery = ""; }
    activeCategory = key;
    activeGroup = null;
    if (key !== "subjects") activeSubjectSubitem = null;
    if (cat.bucket) refreshThumbs(cat.bucket);
    scrollBrowserTop();
  }

  function selectSubjectSubitem(key) {
    activeSubjectSubitem = activeSubjectSubitem === key ? null : key;
    searchQuery = "";
    debouncedQuery = "";
    scrollBrowserTop();
  }

  function selectGroup(groupName) {
    activeGroup = activeGroup === groupName ? null : groupName;
    scrollBrowserTop();
  }

  function groupDisplay(bucket, groupName) {
    if (groupName === MODIFIER_GROUP_KEY) return "Modifiers";
    const g = bucketCache[bucket]?.groups?.find(g => g.group_name === groupName);
    return g?.display_name || groupName;
  }

  // ----------------------------------------------------------------------
  //  SUBJECTS
  // ----------------------------------------------------------------------

  function spawnSubject(type = "person", overrides = {}) {
    const idx = nextSubjectIdx;
    const letter = SUBJECT_LETTERS[idx % 26] || "?";
    const id = `subj_${Date.now()}_${idx}`;
    const subj = {
      id,
      type,
      name: overrides.name || `Subject ${letter}`,
      letter,
      character: overrides.character || null,
      regionName: overrides.regionName ?? null,
      slots: {},
      freeform: [],
      // Section-anchored freeform — phrases the parser couldn't bind to
      // any chip but knew came from a specific section. Emitted back into
      // their section on compose so an edited-but-unrecognized outfit
      // chip stays in `// Outfit:` instead of leaking into the subject
      // body. Keys mirror the parser's section taxonomy.
      sectionFreeform: { outfit: [], pose: [], interaction: [], scene: [] },
      // Active outfit/pose carry the chosen preset's identity (id, name,
      // source character) so the trigger button can render its label even
      // when the preset is from a different character than `character`.
      activeOutfit: null,
      activePose: null,
      // Snapshots of what the active outfit/pose preset injected. Used to
      // remove the previous preset's contribution before applying a new one,
      // so switching presets is a real delta — not stacking.
      outfitSnapshot: null,
      poseSnapshot: null,
      // Per-section expansion. Section keys map to category keys
      // (appearance, clothing, pose). When false/missing, empty slot rows
      // are hidden in that section. Defaults to all collapsed.
      expandedSections: {},
      // Identity assertions split out of freeform — bound character tag
      // chips like (cammy_white:1.1). Rendered as the first row of the
      // Appearance section.
      identityTokens: [],
      // Modifiers — count/solo tokens (1girl, 2girls, solo, etc.).
      // Picker-driven and identity-agnostic so a blank subject can
      // declare them.
      modifiers: [],
    };
    subjects = [...subjects, subj];
    nextSubjectIdx = idx + 1;
    activeSubjectId = id;
    return subj;
  }

  // Unified identity-option shape consumed by the picker, the rail, and
  // applyIdentity. `kind` distinguishes characters from cast items so
  // post-bind work (outfit/pose detail fetch) can branch.
  function characterToOption(char) {
    return {
      kind: "character",
      kindLabel: "Character",
      tag: char.tag,
      display: char.display || char.tag,
      series: char.series || "",
      base_tags: char.base_tags || "",
      base_natlang: char.base_natlang || "",
    };
  }

  function castToOption(item, group) {
    const subDef = SUBJECT_SUBITEMS.find(s => s.filter === group);
    return {
      kind: "cast",
      kindLabel: subDef?.label || group,
      group,
      tag: item.item_tag,
      display: item.display_name || item.item_tag,
      series: "",
      base_tags: item.base_tags || "",
      base_natlang: item.base_natlang || "",
    };
  }

  async function ensureSubjectBucketsLoaded() {
    const subjectBuckets = CATEGORIES
      .filter(c => c.scope === "subject" && c.enabled && c.bucket)
      .map(c => c.bucket);
    await Promise.all(subjectBuckets.map(b => loadBucket(b)));
  }

  // Routing for clicks in the rail/middle browser:
  //   - no active subject       -> spawn fresh with this identity
  //   - active w/o identity     -> bind directly to active
  //   - active with identity    -> open swap-confirm modal
  async function pickIdentityFromBrowser(option) {
    recordRecent({ type: "identity", option });
    const subj = activeSubject;
    if (subj && subj.character) {
      pendingIdentitySwap = { subjId: subj.id, current: subj.character, next: option };
      return;
    }
    if (subj && !subj.character) {
      await applyIdentity(subj.id, option);
      return;
    }
    await spawnSubjectWithIdentity(option);
  }

  // Routing for picks made via a subject's Identity dropdown. Always
  // targets that subject; prompts the swap modal if it already carries an
  // identity.
  async function pickIdentityFromDropdown(option) {
    const subjId = identityPickerOpen;
    closeIdentityPicker();
    const subj = subjects.find(s => s.id === subjId);
    if (!subj) return;
    if (subj.character) {
      pendingIdentitySwap = { subjId, current: subj.character, next: option };
      return;
    }
    await applyIdentity(subjId, option);
  }

  // Fetch the character's default outfit row (is_default=1) so we can
  // auto-apply it on identity pick. Returns null on miss / fetch error.
  async function fetchCharacterDefaultOutfit(characterTag) {
    try {
      const res = await fetch(
        `/promptchain/tag-builder/outfits?scope_character=${encodeURIComponent(characterTag)}&per_page=50`,
      );
      if (!res.ok) return null;
      const data = await res.json();
      return (data.results || []).find(
        (r) => r.character_tag === characterTag && r.is_default === 1,
      ) || null;
    } catch { return null; }
  }

  // Bind/replace the identity on an existing subject. Reparses base_tags
  // and overwrites only the slot groups the new identity covers — manual
  // additions in untouched groups are preserved. Freeform is replaced
  // wholesale because it carries identity tokens like (cammy_white:1.1)
  // and 1girl. Outfit/pose are kept across identity swaps so the user can
  // mix-and-match (e.g. swap character but keep the outfit on screen);
  // the character's default outfit only auto-applies when the subject has
  // no outfit set yet.
  async function applyIdentity(subjId, option) {
    await ensureSubjectBucketsLoaded();
    const { matched, freeform: rawFreeform } = parseTagsToSlots(option.base_tags);
    const { identity: identityTokens, modifiers: parsedModifiers, free: freeform } =
      partitionTokens(rawFreeform, identityMatchToken(option));

    // Fetch character chip overrides — used to enrich appearance chips
    // when this character is the active identity. Cast items don't have
    // overrides today, so we only fetch for "character" kind.
    let characterOverrides = {};
    if (option.kind === "character" && option.tag) {
      try {
        const res = await fetch(`/promptchain/tag-builder/characters/${encodeURIComponent(option.tag)}/overrides`);
        if (res.ok) {
          const data = await res.json();
          characterOverrides = data.overrides || {};
        }
      } catch {}
    }

    subjects = subjects.map(s => {
      if (s.id !== subjId) return s;
      const nextSlots = { ...s.slots };
      for (const [catKey, groups] of Object.entries(matched)) {
        const cat = { ...(nextSlots[catKey] || {}) };
        for (const [grp, items] of Object.entries(groups)) cat[grp] = items;
        nextSlots[catKey] = cat;
      }
      // Preserve user-customized names. Only auto-rename when the current
      // name still matches the previously-bound identity's display.
      const prevAutoName = s.character?.display || `Subject ${s.letter}`;
      const isAutoNamed = s.name === prevAutoName;
      // Merge parsed modifiers with any the user already picked, deduped.
      const mergedModifiers = mergeFreeform(s.modifiers || [], parsedModifiers);
      return {
        ...s,
        name: isAutoNamed ? (option.display || option.tag) : s.name,
        character: {
          tag: option.tag,
          display: option.display,
          series: option.series,
          base_tags: option.base_tags,
          base_natlang: option.base_natlang,
          kind: option.kind,
          group: option.group || null,
          overrides: characterOverrides,
          commentHeader: defaultCharacterCommentHeader(option),
        },
        slots: nextSlots,
        freeform,
        identityTokens,
        modifiers: mergedModifiers,
      };
    });

    activeSubjectId = subjId;

    // Auto-apply the character's default outfit when this subject has
    // none yet. Skip if an outfit is already on the subject (mix-and-
    // match): the user explicitly picked it and we don't overwrite.
    if (option.kind === "character" && option.tag) {
      const boundSubj = subjects.find((s) => s.id === subjId);
      if (boundSubj && !boundSubj.activeOutfit) {
        const def = await fetchCharacterDefaultOutfit(option.tag);
        if (def) applyPreset(subjId, "outfit", presetRowToOption(def, "outfit"));
      }
    }
  }

  async function spawnSubjectWithIdentity(option) {
    let characterOverrides = {};
    if (option.kind === "character" && option.tag) {
      try {
        const res = await fetch(`/promptchain/tag-builder/characters/${encodeURIComponent(option.tag)}/overrides`);
        if (res.ok) {
          const data = await res.json();
          characterOverrides = data.overrides || {};
        }
      } catch {}
    }

    const subj = spawnSubject("person", {
      name: option.display || option.tag,
      character: {
        tag: option.tag,
        display: option.display,
        series: option.series,
        base_tags: option.base_tags,
        base_natlang: option.base_natlang,
        kind: option.kind,
        group: option.group || null,
        overrides: characterOverrides,
        commentHeader: defaultCharacterCommentHeader(option),
      },
    });
    await ensureSubjectBucketsLoaded();
    const { matched, freeform: rawFreeform } = parseTagsToSlots(option.base_tags);
    const { identity: identityTokens, modifiers, free: freeform } =
      partitionTokens(rawFreeform, identityMatchToken(option));
    subjects = subjects.map(s =>
      s.id === subj.id ? { ...s, slots: matched, freeform, identityTokens, modifiers } : s
    );

    // Fresh subject has no outfit yet — pull the character's default.
    if (option.kind === "character" && option.tag) {
      const def = await fetchCharacterDefaultOutfit(option.tag);
      if (def) applyPreset(subj.id, "outfit", presetRowToOption(def, "outfit"));
    }
  }

  function confirmIdentitySwap() {
    if (!pendingIdentitySwap) return;
    const pending = pendingIdentitySwap;
    pendingIdentitySwap = null;
    applyIdentity(pending.subjId, pending.next);
  }

  function cancelIdentitySwap() {
    pendingIdentitySwap = null;
  }

  // Drop the identity binding without touching parsed slots or freeform —
  // mirrors how the × on outfit/pose only removes that preset's contribution.
  // identityTokens explicitly reference the bound identity, so those clear
  // too. Outfit and pose are kept on purpose: stripping the character
  // shouldn't blow away the look the user just composed — supports
  // mix-and-match (e.g. drop the identity but keep the outfit, then bind
  // a different character to wear it).
  function unbindIdentity(subjId) {
    subjects = subjects.map(s => {
      if (s.id !== subjId) return s;
      const wasAutoNamed = s.name === (s.character?.display || `Subject ${s.letter}`);
      return {
        ...s,
        name: wasAutoNamed ? `Subject ${s.letter}` : s.name,
        character: null,
        identityTokens: [],
      };
    });
  }

  // ----------------------------------------------------------------------
  //  IDENTITY PICKER
  // ----------------------------------------------------------------------

  function toggleIdentityPicker(subjId, triggerEl) {
    if (identityPickerOpen === subjId) {
      closeIdentityPicker();
      return;
    }
    openIdentityPicker(subjId, triggerEl);
  }

  function openIdentityPicker(subjId, triggerEl) {
    identityPickerOpen = subjId;
    identityPickerQuery = "";
    if (triggerEl) {
      const r = triggerEl.getBoundingClientRect();
      identityPickerRect = {
        left: r.left,
        top: r.bottom + 4,
        width: Math.max(280, r.width),
      };
    }
    loadIdentityChars("");
    // Focus on next frame after Svelte mounts the input.
    requestAnimationFrame(() => identityPickerSearchEl?.focus());
  }

  function closeIdentityPicker() {
    identityPickerOpen = null;
    if (identityPickerHandle) {
      clearTimeout(identityPickerHandle);
      identityPickerHandle = null;
    }
  }

  // Debounced character search — separate from the rail's `characters`
  // cache so the dropdown query and the rail query don't collide.
  $effect(() => {
    if (identityPickerOpen === null) return;
    const q = identityPickerQuery;
    if (identityPickerHandle) clearTimeout(identityPickerHandle);
    identityPickerHandle = setTimeout(() => loadIdentityChars(q), 200);
  });

  async function loadIdentityChars(query) {
    identityCharLoading = true;
    try {
      const params = new URLSearchParams({ page: "1", per_page: "60", sort: "post_count" });
      if (query) params.set("search", query);
      params.set("natlang_status", "normalized");
      const res = await fetch(`/promptchain/tag-builder/characters?${params}`);
      const data = res.ok ? await res.json() : { characters: [] };
      identityCharResults = data.characters || [];
    } catch (e) {
      identityCharResults = [];
    }
    identityCharLoading = false;
  }

  // Combined character + cast results for the open identity dropdown.
  // Characters arrive search-filtered from the server; cast items are
  // filtered locally against the same query.
  let identityResults = $derived.by(() => {
    const q = identityPickerQuery.trim().toLowerCase().replace(/[_\s]+/g, " ");
    const out = [];
    for (const c of identityCharResults) out.push(characterToOption(c));
    for (const sub of SUBJECT_SUBITEMS) {
      if (sub.source !== "cast") continue;
      const items = castCache[sub.filter]?.items || [];
      for (const it of items) {
        if (q) {
          const d = (it.display_name || it.item_tag || "").toLowerCase().replace(/[_\s]+/g, " ");
          const t = (it.item_tag || "").toLowerCase().replace(/[_\s]+/g, " ");
          if (!d.includes(q) && !t.includes(q)) continue;
        }
        out.push(castToOption(it, sub.filter));
      }
    }
    return out;
  });

  // Click-outside closes the picker. Capture phase + closest() so we get
  // the click before any deeper handler stops propagation, and clicks
  // inside the picker or its trigger button are exempt. Don't close on
  // scroll — capture-phase scroll fires for inner list scrolling too.
  $effect(() => {
    if (identityPickerOpen === null) return;
    function onDocClick(e) {
      if (e.target.closest('.pcr-atb2-identity-dd')) return;
      if (e.target.closest('.pcr-atb2-identity-trigger')) return;
      closeIdentityPicker();
    }
    // Add directly — this $effect runs after the opening click has finished
    // dispatching, so the capture-phase listener can't catch that same click
    // (no setTimeout(0) deferral needed).
    document.addEventListener('click', onDocClick, true);
    return () => document.removeEventListener('click', onDocClick, true);
  });

  // ----------------------------------------------------------------------
  //  PRESET PICKER (outfit / pose)
  // ----------------------------------------------------------------------

  function togglePresetPicker(kind, subjId, triggerEl) {
    if (presetPickerOpen?.kind === kind && presetPickerOpen?.subjId === subjId) {
      closePresetPicker();
      return;
    }
    openPresetPicker(kind, subjId, triggerEl);
  }

  function openPresetPicker(kind, subjId, triggerEl) {
    presetPickerOpen = { kind, subjId };
    presetPickerQuery = "";
    if (triggerEl) {
      const r = triggerEl.getBoundingClientRect();
      presetPickerRect = {
        left: r.left,
        top: r.bottom + 4,
        width: Math.max(320, r.width),
      };
    }
    const subj = subjects.find(s => s.id === subjId);
    const scope = subj?.character?.kind === "character" ? subj.character.tag : "";
    loadPresets(kind, "", scope);
    requestAnimationFrame(() => presetPickerSearchEl?.focus());
  }

  function closePresetPicker() {
    presetPickerOpen = null;
    if (presetPickerHandle) {
      clearTimeout(presetPickerHandle);
      presetPickerHandle = null;
    }
  }

  $effect(() => {
    if (!presetPickerOpen) return;
    const q = presetPickerQuery;
    const kind = presetPickerOpen.kind;
    const subj = subjects.find(s => s.id === presetPickerOpen.subjId);
    const scope = subj?.character?.kind === "character" ? subj.character.tag : "";
    if (presetPickerHandle) clearTimeout(presetPickerHandle);
    presetPickerHandle = setTimeout(() => loadPresets(kind, q, scope), 200);
  });

  async function loadPresets(kind, query, scope) {
    presetPickerLoading = true;
    try {
      const path = kind === "outfit" ? "outfits" : "poses";
      const params = new URLSearchParams({ page: "1", per_page: "60" });
      if (query) params.set("search", query);
      if (scope) params.set("scope_character", scope);
      const res = await fetch(`/promptchain/tag-builder/${path}?${params}`);
      const data = res.ok ? await res.json() : { results: [] };
      presetPickerResults = data.results || [];
    } catch (e) {
      presetPickerResults = [];
    }
    presetPickerLoading = false;
  }

  // Parse a JSON-array column into a string[]; tolerate NULL/empty/malformed
  // by returning an empty array. Used for outfit/pose appearance_adds and
  // appearance_removes which the backend ships as JSON-encoded TEXT.
  function parseTagArray(jsonStr) {
    if (!jsonStr) return [];
    try {
      const v = JSON.parse(jsonStr);
      return Array.isArray(v) ? v.filter(x => typeof x === "string" && x) : [];
    } catch {
      return [];
    }
  }

  // Map a /outfits or /poses row into the option shape applyPreset expects.
  // `overrides` is the per-chip natlang override map shipped with the row.
  // `appearance_adds` / `appearance_removes` carry the outfit/pose's delta
  // against the character's bound appearance chips — SF6 Cammy adds
  // short_hair and removes twin_braids+long_hair, for example.
  function presetRowToOption(row, kind) {
    const common = {
      id: row.id,
      character_tag: row.character_tag,
      character_display: row.character_display,
      character_series: row.character_series,
      overrides: row.overrides || {},
      appearance_adds: parseTagArray(row.appearance_adds),
      appearance_removes: parseTagArray(row.appearance_removes),
    };
    if (kind === "outfit") {
      return {
        ...common,
        name: row.outfit_name,
        tags: row.outfit_tags,
        natlang: row.outfit_natlang,
      };
    }
    return {
      ...common,
      name: row.pose_name,
      tags: row.pose_tags,
      natlang: row.pose_natlang,
    };
  }

  function pickPresetFromDropdown(row) {
    if (!presetPickerOpen) return;
    const { kind, subjId } = presetPickerOpen;
    closePresetPicker();
    applyPreset(subjId, kind, presetRowToOption(row, kind));
  }

  $effect(() => {
    if (!presetPickerOpen) return;
    function onDocClick(e) {
      if (e.target.closest('.pcr-atb2-preset-dd')) return;
      if (e.target.closest('.pcr-atb2-preset-trigger')) return;
      closePresetPicker();
    }
    // Add directly — this $effect runs after the opening click has finished
    // dispatching, so the capture-phase listener can't catch that same click
    // (no setTimeout(0) deferral needed).
    document.addEventListener('click', onDocClick, true);
    return () => document.removeEventListener('click', onDocClick, true);
  });

  // Remove an active outfit or pose: subtract the snapshot's contribution
  // and clear the active marker + snapshot. Inverse of applyPreset.
  function removePreset(subjId, kind) {
    subjects = subjects.map(s => {
      if (s.id !== subjId) return s;
      const snap = kind === "outfit" ? s.outfitSnapshot : s.poseSnapshot;
      let next = subtractSnapshot(s, snap);
      if (kind === "outfit") {
        next = { ...next, activeOutfit: null, outfitSnapshot: null };
      } else {
        next = { ...next, activePose: null, poseSnapshot: null };
      }
      return next;
    });
  }

  // Subtract a previously-applied parse snapshot from a subject. Removes
  // exactly the items and freeform tokens the snapshot added, leaving
  // unrelated manual edits intact. Used to delta-apply outfit/pose swaps.
  function subtractSnapshot(s, snapshot) {
    if (!snapshot) return s;
    const nextSlots = { ...s.slots };
    for (const [catKey, groups] of Object.entries(snapshot.matched || {})) {
      if (!nextSlots[catKey]) continue;
      const cat = { ...nextSlots[catKey] };
      for (const [grp, items] of Object.entries(groups)) {
        const drop = new Set(items.map(i => i.item_tag));
        const filtered = (cat[grp] || []).filter(x => !drop.has(x.item_tag));
        if (filtered.length) cat[grp] = filtered; else delete cat[grp];
      }
      if (Object.keys(cat).length) nextSlots[catKey] = cat; else delete nextSlots[catKey];
    }
    const dropFree = new Set(snapshot.freeform || []);
    const nextFreeform = (s.freeform || []).filter(t => !dropFree.has(t));
    return { ...s, slots: nextSlots, freeform: nextFreeform };
  }

  // Apply an outfit or pose preset (from the global picker). Real delta
  // semantics: subtract the previous preset of the same kind first, then
  // merge the new parse on top of whatever's left, preserving manual edits
  // and the other preset.
  //
  // option carries: id, character_tag, character_display, name, tags, natlang
  function applyPreset(subjId, kind, option) {
    const parse = parseTagsToSlots(option.tags || "");
    const marker = {
      id: option.id,
      character_tag: option.character_tag,
      character_display: option.character_display,
      character_series: option.character_series || "",
      name: option.name,
      natlang: option.natlang || "",
      overrides: option.overrides || {},
      appearance_adds: option.appearance_adds || [],
      appearance_removes: option.appearance_removes || [],
    };

    subjects = subjects.map(s => {
      if (s.id !== subjId) return s;

      const prev = kind === "outfit" ? s.outfitSnapshot : s.poseSnapshot;
      let next = subtractSnapshot(s, prev);

      const nextSlots = { ...next.slots };
      for (const [catKey, groups] of Object.entries(parse.matched)) {
        const cat = { ...(nextSlots[catKey] || {}) };
        for (const [grp, items] of Object.entries(groups)) {
          const existing = cat[grp] || [];
          const have = new Set(existing.map(i => i.item_tag));
          cat[grp] = [...existing, ...items.filter(i => !have.has(i.item_tag))];
        }
        nextSlots[catKey] = cat;
      }

      next = {
        ...next,
        slots: nextSlots,
        freeform: mergeFreeform(next.freeform, parse.freeform),
      };
      if (kind === "outfit") {
        next.activeOutfit = marker;
        next.outfitSnapshot = parse;
      } else {
        next.activePose = marker;
        next.poseSnapshot = parse;
      }
      return next;
    });
  }

  // Split a comma-separated tag string, strip weight wrappers like
  // "(foo:1.1)", look each token up in the loaded bucket items.
  // Returns { matched: { catKey: { groupName: [items] } }, freeform: [strings] }.
  // Dedupes both matched items and freeform tokens — duplicates would crash
  // the keyed {#each} blocks rendering chips.
  function parseTagsToSlots(tagString) {
    const matched = {};
    const freeformSet = new Set();
    const freeform = [];
    if (!tagString) return { matched, freeform };
    const tokens = tagString.split(",").map(t => t.trim()).filter(Boolean);
    const pushFree = (t) => { if (!freeformSet.has(t)) { freeformSet.add(t); freeform.push(t); } };
    for (const tok of tokens) {
      const stripped = tok
        .replace(/^\(([^:)]+):[^)]+\)$/, "$1")  // (foo:1.1) -> foo
        .replace(/^\(([^)]+)\)$/, "$1");        // (foo) -> foo
      const lookup = tagToItem.get(stripped);
      if (!lookup) { pushFree(tok); continue; }
      const cat = CATEGORIES.find(c => c.bucket === lookup.bucket);
      if (!cat) { pushFree(tok); continue; }
      if (!matched[cat.key]) matched[cat.key] = {};
      if (!matched[cat.key][lookup.group]) matched[cat.key][lookup.group] = [];
      if (!matched[cat.key][lookup.group].some(x => x.item_tag === lookup.item.item_tag)) {
        matched[cat.key][lookup.group].push(lookup.item);
      }
    }
    return { matched, freeform };
  }

  // Concat two freeform arrays, deduping (keyed-each requires unique keys).
  function mergeFreeform(a, b) {
    const seen = new Set();
    const out = [];
    for (const arr of [a || [], b || []]) {
      for (const t of arr) {
        if (!seen.has(t)) { seen.add(t); out.push(t); }
      }
    }
    return out;
  }

  // ----------------------------------------------------------------------
  //  ROUND-TRIP PARSER — rebuild right-panel state from the raw prompt
  //  text the editor was invoked on. Tag-mode only for now.
  // ----------------------------------------------------------------------

  function makeBlankSubject(letter, idx) {
    return {
      id: `subj_${Date.now()}_${idx}`,
      type: "person",
      name: `Subject ${letter}`,
      letter,
      character: null,
      slots: {},
      freeform: [],
      sectionFreeform: { outfit: [], pose: [], interaction: [], scene: [] },
      activeOutfit: null,
      activePose: null,
      outfitSnapshot: null,
      poseSnapshot: null,
      expandedSections: {},
      identityTokens: [],
      modifiers: [],
      // Which `$name{}` regional block this subject emits back into (Phase 2
      // whole-composition edit). null = un-regioned; in region mode compose
      // assigns a fresh `$mannequinN` on output.
      regionName: null,
    };
  }

  // After tokenization, run cluster-detect for outfit/pose per subject
  // and reconstruct activeOutfit/Pose markers + their snapshots so delta
  // semantics work for subsequent edits.
  async function detectOutfitsAndPosesFor(subj) {
    if (!subj.character?.tag) return;
    // Cast archetypes have no character-scoped outfits/poses; their tag
    // ("archetype_motherly") isn't a real character_tag, so skip detection.
    if (subj.character.kind === "cast") return;
    const charTag = subj.character.tag;

    const clothingChips = [];
    for (const grp of Object.values(subj.slots.clothing || {})) {
      for (const it of grp) clothingChips.push(it.item_tag);
    }
    if (clothingChips.length) {
      try {
        const res = await fetch(`/promptchain/tag-builder/detect-outfit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chips: clothingChips, character_tag: charTag, threshold: 0.8 }),
        });
        const data = await res.json();
        const m = (data.matches || [])[0];
        if (m) {
          const oRes = await fetch(`/promptchain/tag-builder/outfits?scope_character=${encodeURIComponent(charTag)}&per_page=200`);
          if (oRes.ok) {
            const oData = await oRes.json();
            const row = (oData.results || []).find(r => r.id === m.outfit_id);
            if (row) {
              subj.activeOutfit = {
                id: row.id,
                character_tag: row.character_tag,
                character_display: row.character_display,
                character_series: row.character_series || "",
                name: row.outfit_name,
                natlang: row.outfit_natlang || "",
                overrides: row.overrides || {},
                appearance_adds: parseTagArray(row.appearance_adds),
                appearance_removes: parseTagArray(row.appearance_removes),
              };
              subj.outfitSnapshot = parseTagsToSlots(row.outfit_tags || "");
            }
          }
        }
      } catch {}
    }

    const poseChips = [];
    for (const grp of Object.values(subj.slots.pose || {})) {
      for (const it of grp) poseChips.push(it.item_tag);
    }
    if (poseChips.length) {
      try {
        const res = await fetch(`/promptchain/tag-builder/detect-pose`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chips: poseChips, character_tag: charTag, threshold: 0.8 }),
        });
        const data = await res.json();
        const m = (data.matches || [])[0];
        if (m) {
          const pRes = await fetch(`/promptchain/tag-builder/poses?scope_character=${encodeURIComponent(charTag)}&per_page=200`);
          if (pRes.ok) {
            const pData = await pRes.json();
            const row = (pData.results || []).find(r => r.id === m.pose_id);
            if (row) {
              subj.activePose = {
                id: row.id,
                character_tag: row.character_tag,
                character_display: row.character_display,
                character_series: row.character_series || "",
                name: row.pose_name,
                natlang: row.pose_natlang || "",
                overrides: row.overrides || {},
                appearance_adds: parseTagArray(row.appearance_adds),
                appearance_removes: parseTagArray(row.appearance_removes),
              };
              subj.poseSnapshot = parseTagsToSlots(row.pose_tags || "");
            }
          }
        }
      } catch {}
    }
  }

  // Add a chip into a subject's slot, deduped.
  function addChipToSubject(subj, lookup) {
    const cat = CATEGORIES.find(c => c.bucket === lookup.bucket);
    if (!cat || cat.scope !== "subject") return false;
    if (!subj.slots[cat.key]) subj.slots[cat.key] = {};
    if (!subj.slots[cat.key][lookup.group]) subj.slots[cat.key][lookup.group] = [];
    if (!subj.slots[cat.key][lookup.group].some(x => x.item_tag === lookup.item.item_tag)) {
      subj.slots[cat.key][lookup.group].push(lookup.item);
      return true;
    }
    return false;
  }

  async function fetchCharacterOverrides(tag) {
    try {
      const res = await fetch(`/promptchain/tag-builder/characters/${encodeURIComponent(tag)}/overrides`);
      if (res.ok) return (await res.json()).overrides || {};
    } catch {}
    return {};
  }

  function buildChipNatlangMap() {
    // Map natlang phrase → tagToItem-shaped lookup. First-write-wins
    // mirrors the bucket-precedence used elsewhere.
    const map = new Map();
    for (const [bucket, data] of Object.entries(bucketCache)) {
      if (!data?.items) continue;
      for (const it of data.items) {
        const nl = (it.base_natlang || "").trim();
        if (!nl) continue;
        if (!map.has(nl)) map.set(nl, { bucket, group: it.item_group, item: it });
      }
    }
    return map;
  }

  // Chips whose base_natlang itself contains commas (e.g. full-outfit chips
  // describing armor as "a metal helmet, a plate breastplate, …"). Those
  // can't survive the normal "split prompt on comma → chunk lookup" path
  // because the chip's own natlang is multi-chunk. We pre-pass those
  // against the full prompt text before splitting. Longest-first so a
  // long armor natlang wins over any shorter chip whose natlang is a
  // proper substring of it.
  function buildMultiCommaChipList() {
    const out = [];
    for (const [bucket, data] of Object.entries(bucketCache)) {
      if (!data?.items) continue;
      for (const it of data.items) {
        const nl = (it.base_natlang || "").trim().replace(/\.\s*$/, "");
        if (!nl || !nl.includes(",")) continue;
        out.push({ natlang: nl, lookup: { bucket, group: it.item_group, item: it } });
      }
    }
    out.sort((a, b) => b.natlang.length - a.natlang.length);
    return out;
  }

  // Pre-pass scanner. For each multi-comma chip natlang (longest-first),
  // find occurrences in `text` with comma/period/whitespace boundaries on
  // both sides. Claim spans without overlap and remove them from the
  // returned remaining text. The caller hands `claims` to the parse
  // function so each claim lands on the active subject (or scene) before
  // the normal comma-split chunk loop processes the leftovers.
  function scanMultiCommaChips(text, list) {
    if (!text || !list.length) return { claims: [], remaining: text };
    const taken = []; // [start, end] intervals already claimed
    const matches = []; // {lookup, start, end} ordered by claim time
    for (const entry of list) {
      let from = 0;
      while (from <= text.length) {
        const at = text.indexOf(entry.natlang, from);
        if (at < 0) break;
        const end = at + entry.natlang.length;
        const before = at === 0 ? "" : text.charAt(at - 1);
        const after = end >= text.length ? "" : text.charAt(end);
        const okBefore = at === 0 || /[.,;\s]/.test(before);
        const okAfter = end >= text.length || /[.,;\s]/.test(after);
        let overlap = false;
        for (const [s, e] of taken) {
          if (at < e && end > s) { overlap = true; break; }
        }
        if (okBefore && okAfter && !overlap) {
          matches.push({ lookup: entry.lookup, start: at, end });
          taken.push([at, end]);
          from = end;
        } else {
          from = at + 1;
        }
      }
    }
    taken.sort((a, b) => a[0] - b[0]);
    matches.sort((a, b) => a.start - b.start);
    let remaining = "";
    let pos = 0;
    for (const [s, e] of taken) {
      remaining += text.slice(pos, s);
      pos = e;
    }
    remaining += text.slice(pos);
    // Collapse separator artifacts from the splice (", , " → ", " etc.).
    remaining = remaining
      .replace(/\s*,\s*,\s*/g, ", ")
      .replace(/\s*\.\s*,\s*/g, ". ")
      .replace(/\s*,\s*\.\s*/g, ". ")
      .replace(/^[\s,;.]+|[\s,;.]+$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    return {
      claims: matches.map(m => m.lookup),
      remaining,
    };
  }

  // Route claims (from the multi-comma pre-pass) into the subject or
  // scene selections by category scope. Mirrors the routing inside the
  // normal token loops in parseTag/parseNatlang.
  function applyMultiCommaClaims(claims, subj, sceneSelectionsTarget) {
    if (!claims?.length) return;
    for (const lookup of claims) {
      const cat = CATEGORIES.find(c => c.bucket === lookup.bucket);
      if (cat?.scope === "subject" && subj) {
        addChipToSubject(subj, lookup);
      } else if (cat?.scope === "global" && sceneSelectionsTarget) {
        if (!sceneSelectionsTarget[lookup.group]) sceneSelectionsTarget[lookup.group] = [];
        if (!sceneSelectionsTarget[lookup.group].some(x => x.item_tag === lookup.item.item_tag)) {
          sceneSelectionsTarget[lookup.group].push(lookup.item);
        }
      }
    }
  }

  function buildModifierNatlangMap() {
    const map = new Map();
    for (const [tok, nl] of Object.entries(MODIFIER_NATLANG)) {
      if (!map.has(nl)) map.set(nl, tok);
    }
    return map;
  }

  // Cast archetypes emit as their clean base_tags lead (e.g. "motherly"),
  // not as a parenthesized identity token. To rebind them on round-trip,
  // map that lead token → { item, group }. Exclude tokens that are already
  // modifiers, chips, or characters so cast can never shadow those paths
  // (which have their own, higher-priority binding).
  function buildCastIdentityMap() {
    const map = new Map();
    for (const [group, entry] of Object.entries(castCache)) {
      for (const item of (entry?.items || [])) {
        const first = (item.base_tags || "").split(",").map(s => s.trim()).filter(Boolean)[0];
        const key = (first || item.item_tag || "").toLowerCase();
        if (!key) continue;
        if (MODIFIER_TOKENS.has(key)) continue;
        if (tagToItem.has(key) || tagToItem.has(key.replace(/ /g, "_"))) continue;
        if (normalizedCharacterTags.has(key)) continue;
        // Key by both underscore and space forms — a multi-word archetype
        // tag ("mecha_musume") emits as "mecha musume" under tag_format
        // spaces, so the round-trip lookup must hit either way.
        const spaceKey = key.replace(/_/g, " ");
        if (!map.has(key)) map.set(key, { item, group });
        if (!map.has(spaceKey)) map.set(spaceKey, { item, group });
      }
    }
    return map;
  }

  function reverseOverrides(overrides) {
    // chip_tag → natlang  becomes  natlang → chip_tag.
    const map = new Map();
    for (const [chipTag, nl] of Object.entries(overrides || {})) {
      if (!map.has(nl)) map.set(nl, chipTag);
    }
    return map;
  }

  async function parseNatlangPrompt(sectionedChunks, charRecord, skipPhrases = null, commentHeader = null, multiCommaClaims = []) {
    // Bind the matched character into a fresh subject. The natlang
    // prefix in the prompt is the surface representation of the
    // identity — the binding is on subj.character; the chip renders
    // from character.display, not from any literal token text.
    // `rest` is the chip-phrase stream with the character chunk already
    // spliced out by parseInitialPrompt (character may have appeared at
    // the start or anywhere in the middle).
    const overrides = await fetchCharacterOverrides(charRecord.tag);
    const letter = SUBJECT_LETTERS[0];
    const subj = {
      ...makeBlankSubject(letter, 1),
      name: charRecord.display || charRecord.tag,
      character: {
        tag: charRecord.tag,
        display: charRecord.display,
        series: charRecord.series,
        base_tags: charRecord.base_tags || "",
        base_natlang: charRecord.base_natlang || "",
        kind: "character",
        group: null,
        overrides,
        // Verbatim header text from the user's prompt, or null if there
        // wasn't one above the character's base_natlang line. Compose
        // re-emits this so we don't duplicate or overwrite the user.
        commentHeader,
      },
    };

    // Fetch this character's outfits + poses up front so we can match
    // per-chip override natlangs during the first parse pass. Without
    // this, override-natlang phrases land in freeform because cluster
    // detection (which needs chips in slots) hasn't run yet.
    const [outfitData, poseData] = await Promise.all([
      fetch(`/promptchain/tag-builder/outfits?scope_character=${encodeURIComponent(charRecord.tag)}&per_page=200`)
        .then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] })),
      fetch(`/promptchain/tag-builder/poses?scope_character=${encodeURIComponent(charRecord.tag)}&per_page=200`)
        .then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] })),
    ]);
    const outfits = outfitData.results || [];
    const poses = poseData.results || [];

    // Reverse maps: natlang phrase -> { id, chip_tag, row }.
    const outfitOverrideByNatlang = new Map();
    for (const o of outfits) {
      for (const [chipTag, nl] of Object.entries(o.overrides || {})) {
        if (!outfitOverrideByNatlang.has(nl)) {
          outfitOverrideByNatlang.set(nl, { id: o.id, chip_tag: chipTag, row: o });
        }
      }
    }
    const poseOverrideByNatlang = new Map();
    for (const p of poses) {
      for (const [chipTag, nl] of Object.entries(p.overrides || {})) {
        if (!poseOverrideByNatlang.has(nl)) {
          poseOverrideByNatlang.set(nl, { id: p.id, chip_tag: chipTag, row: p });
        }
      }
    }

    const chipByNatlang = buildChipNatlangMap();
    const modifierByNatlang = buildModifierNatlangMap();
    const charOverrideByNatlang = reverseOverrides(overrides);

    // Vote-counters so the winning outfit/pose is the one whose chips
    // covered the most of the user's text.
    const outfitVotes = {};
    const poseVotes = {};

    // Scene chips don't live on the subject — they go straight into
    // sceneSelections. Build a working copy so chunk matches accumulate
    // without re-rendering on every push; commit once at the end alongside
    // the multi-comma-claim merge.
    const sceneTarget = { ...sceneSelections };

    // Each chunk carries the // section it came from (outfit/pose/
    // interaction/scene/null). Unrecognized phrases land in
    // subj.sectionFreeform[section] instead of subj.freeform so they
    // re-emit inside their original section on compose. Chunks from
    // character/subject headers and the body have section === null and
    // fall through to subj.freeform as before.
    for (const { phrase: chunkRaw, section } of sectionedChunks) {
      let phrase = chunkRaw.trim().replace(/\.$/, "");
      if (!phrase) continue;

      // Strip the `// Outfit` section's leading "Wearing a/an" prose
      // intro so the first chip in a clothing block round-trips to a
      // clean chip-natlang lookup. Subsequent chips in the same comma
      // list don't have the prefix.
      phrase = phrase.replace(/^[Ww]earing(?:\s+an?)?\s+/, "");

      // Skip phrases the style-pass already claimed so style content
      // doesn't fall to freeform on this subject.
      if (skipPhrases && skipPhrases.has(phrase)) continue;

      // Modifier (1girl/solo/etc rendered in natlang).
      if (modifierByNatlang.has(phrase)) {
        const tok = modifierByNatlang.get(phrase);
        if (!subj.modifiers.includes(tok)) subj.modifiers.push(tok);
        continue;
      }

      // Character-specific override (e.g. Cammy's signature scar prose).
      if (charOverrideByNatlang.has(phrase)) {
        const chipTag = charOverrideByNatlang.get(phrase);
        const lookup = tagToItem.get(chipTag);
        if (lookup && addChipToSubject(subj, lookup)) continue;
      }

      // Outfit-specific override across this character's outfits.
      if (outfitOverrideByNatlang.has(phrase)) {
        const { id, chip_tag } = outfitOverrideByNatlang.get(phrase);
        const lookup = tagToItem.get(chip_tag);
        if (lookup && addChipToSubject(subj, lookup)) {
          outfitVotes[id] = (outfitVotes[id] || 0) + 1;
          continue;
        }
      }

      // Pose-specific override.
      if (poseOverrideByNatlang.has(phrase)) {
        const { id, chip_tag } = poseOverrideByNatlang.get(phrase);
        const lookup = tagToItem.get(chip_tag);
        if (lookup && addChipToSubject(subj, lookup)) {
          poseVotes[id] = (poseVotes[id] || 0) + 1;
          continue;
        }
      }

      // Generic chip natlang.
      if (chipByNatlang.has(phrase)) {
        const lookup = chipByNatlang.get(phrase);
        const cat = CATEGORIES.find(c => c.bucket === lookup.bucket);
        if (cat?.scope === "subject" && addChipToSubject(subj, lookup)) continue;
        // Global-scope (scene) chips don't go on a subject. Route to the
        // working sceneTarget — committed to sceneSelections at the end.
        // De-duped by item_tag so re-parsing the same prompt twice doesn't
        // duplicate the same chip.
        if (cat?.scope === "global") {
          const grp = lookup.group;
          if (!sceneTarget[grp]) sceneTarget[grp] = [];
          if (!sceneTarget[grp].some(x => x.item_tag === lookup.item.item_tag)) {
            sceneTarget[grp].push(lookup.item);
          }
          continue;
        }
      }

      // Modifier-stacked natlang: "burgundy torn silk cropped sweater"
      // peels modifier prefix words off the front when the suffix matches
      // a customizable clothing chip's display name.
      const peeled = await peelNatlangModifiers(phrase);
      if (peeled) {
        const stamped = { ...peeled.lookup.item, modifiers: peeled.modifiers };
        if (addChipToSubject(subj, { ...peeled.lookup, item: stamped })) continue;
      }

      // Furniture interaction: "sitting on a wooden chair" → peel verb +
      // furniture display + mods → bind into subj.slots.furniture.<group>
      // with reconstructed _furniture metadata so the customizer can
      // re-open the chip cleanly. Works regardless of which // section
      // the chunk came from (verb prefix is distinctive enough).
      const furnMatch = matchFurnitureInteraction(phrase);
      if (furnMatch) {
        if (!subj.slots.furniture) subj.slots.furniture = {};
        if (!subj.slots.furniture[furnMatch.group]) subj.slots.furniture[furnMatch.group] = [];
        // De-dupe by synthetic tag so re-parse of the same chip doesn't
        // duplicate (e.g. when the user re-opens an edited prompt).
        const arr = subj.slots.furniture[furnMatch.group];
        if (!arr.some(x => x.item_tag === furnMatch.chip.item_tag)) {
          arr.push(furnMatch.chip);
        }
        continue;
      }

      // Unrecognized → section-anchored freeform when we know which
      // section the chunk came from, plain freeform otherwise.
      if (section && subj.sectionFreeform[section]) {
        subj.sectionFreeform[section].push(phrase);
      } else {
        subj.freeform.push(phrase);
      }
    }

    // Bind the winning outfit (by vote count). Cluster detection runs as
    // a fallback only when no override natlangs matched.
    const winningOutfitId = Object.entries(outfitVotes)
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    if (winningOutfitId) {
      const row = outfits.find(x => String(x.id) === String(winningOutfitId));
      if (row) {
        subj.activeOutfit = {
          id: row.id,
          character_tag: row.character_tag,
          character_display: row.character_display,
          character_series: row.character_series || "",
          name: row.outfit_name,
          natlang: row.outfit_natlang || "",
          overrides: row.overrides || {},
          appearance_adds: parseTagArray(row.appearance_adds),
          appearance_removes: parseTagArray(row.appearance_removes),
        };
        subj.outfitSnapshot = parseTagsToSlots(row.outfit_tags || "");
      }
    }
    const winningPoseId = Object.entries(poseVotes)
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    if (winningPoseId) {
      const row = poses.find(x => String(x.id) === String(winningPoseId));
      if (row) {
        subj.activePose = {
          id: row.id,
          character_tag: row.character_tag,
          character_display: row.character_display,
          character_series: row.character_series || "",
          name: row.pose_name,
          natlang: row.pose_natlang || "",
          overrides: row.overrides || {},
          appearance_adds: parseTagArray(row.appearance_adds),
          appearance_removes: parseTagArray(row.appearance_removes),
        };
        subj.poseSnapshot = parseTagsToSlots(row.pose_tags || "");
      }
    }

    // Fallback to cluster detection if no overrides matched (un-curated
    // outfit/pose).
    if (!subj.activeOutfit || !subj.activePose) {
      await detectOutfitsAndPosesFor(subj);
    }

    // Multi-comma chip claims from the pre-pass (chips like armor whose
    // base_natlang contains commas) — route them to this subject or to
    // the working sceneTarget (which already carries any scene chips the
    // chunk loop matched). Commit if anything landed.
    applyMultiCommaClaims(multiCommaClaims, subj, sceneTarget);
    if (Object.keys(sceneTarget).length) {
      sceneSelections = sceneTarget;
      sceneSpawned = true;
    }

    subjects = [subj];
    nextSubjectIdx = 1;
    activeSubjectId = subj.id;
  }

  async function parseTagPrompt(sectionedChunks, firstSubjectCommentHeader = undefined, fromRoundTrip = false, multiCommaClaims = []) {
    const newSubjects = [];
    let currentSubj = null;
    let letterIdx = 0;
    let firstSubjectHeaderApplied = false;
    const ensureSubject = () => {
      if (!currentSubj) {
        const letter = SUBJECT_LETTERS[letterIdx % 26] || "?";
        letterIdx++;
        currentSubj = makeBlankSubject(letter, letterIdx);
        // First subject inherits the user's `// <Name>` line — both as
        // the verbatim commentHeader for round-trip emit, and the parsed
        // name for the editable input on the right panel. When called
        // from round-trip with no header found (explicit null), pin
        // commentHeader to null so compose doesn't re-inject one.
        if (!firstSubjectHeaderApplied && fromRoundTrip) {
          currentSubj.commentHeader = firstSubjectCommentHeader;
          if (firstSubjectCommentHeader) {
            const parsed = nameFromCommentHeader(firstSubjectCommentHeader);
            if (parsed) currentSubj.name = parsed;
          }
          firstSubjectHeaderApplied = true;
        }
        newSubjects.push(currentSubj);
      }
      return currentSubj;
    };
    // Region mode: each `$name{}` block owns exactly one subject. Get-or-create
    // it and make it current so the block's chips/character/freeform all bind
    // to it. Keyed by the `$name` token so blocks never bleed together.
    const regionSubjects = new Map();
    const regionSubjectFor = (region) => {
      let s = regionSubjects.get(region);
      if (!s) {
        const letter = SUBJECT_LETTERS[letterIdx % 26] || "?";
        letterIdx++;
        s = makeBlankSubject(letter, letterIdx);
        s.regionName = region;
        regionSubjects.set(region, s);
        newSubjects.push(s);
      }
      currentSubj = s;
      return s;
    };
    const newSceneSelections = {};
    // Loose phrases that match no chip. They're routed AFTER the content loop,
    // by what the prompt actually contains (was a subject built?) + the edit
    // context — not by which `// header` they sat under. Global ones land in
    // newSceneFreeform (no subject to carry them); the rest attach to a subject.
    const newSceneFreeform = [];
    const pendingFreeform = [];

    // Natlang phrase fallbacks: when a character isn't bound, comma-tokens
    // can still be chip natlangs ("long hair") or modifier-stacked phrases
    // ("wearing a white t-shirt"). Build the same lookup maps the natlang
    // path uses so mixed-format prompts round-trip.
    const chipByNatlang = buildChipNatlangMap();
    const modifierByNatlang = buildModifierNatlangMap();
    let castByIdentityToken;
    try {
      castByIdentityToken = buildCastIdentityMap();
    } catch (e) {
      console.error("[TagBuilder2] buildCastIdentityMap failed", e);
      castByIdentityToken = new Map();
    }

    console.group("[TagBuilder2.parseTagPrompt]");
    console.log("tokens:", sectionedChunks.map(c => c.phrase));
    console.log("chipByNatlang.size:", chipByNatlang.size, "tagToItem.size:", tagToItem.size);
    console.log("loaded buckets:", Object.entries(bucketCache).filter(([, v]) => v?.loaded).map(([k, v]) => `${k}(${v.items?.length || 0})`));

    for (const { phrase: tok, section, region } of sectionedChunks) {
      const stripped = tok
        .replace(/^\((.+):\s*\d+(?:\.\d+)?\)$/, "$1")
        .replace(/^\((.+)\)$/, "$1");

      // Region mode: make this block's subject current so its chips/character/
      // freeform all bind to it. A global chunk (region == null) belongs to no
      // subject — clear currentSubj so loose tags don't leak onto a block.
      if (regionMode) {
        if (region) regionSubjectFor(region);
        else currentSubj = null;
      }

      if (normalizedCharacterTags.has(stripped)) {
        try {
          const cRes = await fetch(`/promptchain/tag-builder/characters/${encodeURIComponent(stripped)}`);
          if (cRes.ok) {
            const cData = await cRes.json();
            const overrides = await fetchCharacterOverrides(stripped);
            const charObj = {
              tag: cData.tag,
              display: cData.display,
              series: cData.series,
              base_tags: cData.base_tags || "",
              base_natlang: cData.base_natlang || "",
              kind: "character",
              group: null,
              overrides,
              commentHeader: defaultCharacterCommentHeader({
                kind: "character",
                display: cData.display,
                series: cData.series,
              }),
            };
            if (regionMode && region) {
              // The block IS the subject — bind onto it, don't spawn a new one.
              const s = regionSubjectFor(region);
              s.character = charObj;
              s.name = cData.display || cData.tag;
              if (!s.identityTokens.includes(tok)) s.identityTokens.push(tok);
            } else {
              const letter = SUBJECT_LETTERS[letterIdx % 26] || "?";
              letterIdx++;
              currentSubj = {
                ...makeBlankSubject(letter, letterIdx),
                name: cData.display || cData.tag,
                character: charObj,
                identityTokens: [tok],
              };
              newSubjects.push(currentSubj);
            }
            continue;
          }
        } catch {}
      }

      // Cast archetype identity (e.g. "motherly" → archetype_motherly).
      // Mirrors the character branch: starts a fresh subject bound to the
      // cast item so "edit tags" round-trips the identity instead of
      // dropping it to freeform.
      const castHit = castByIdentityToken.get(stripped.toLowerCase());
      if (castHit) {
        const display = castHit.item.display_name || castHit.item.item_tag;
        const castObj = {
          tag: castHit.item.item_tag,
          display,
          series: "",
          base_tags: castHit.item.base_tags || "",
          base_natlang: castHit.item.base_natlang || "",
          kind: "cast",
          group: castHit.group,
          overrides: {},
          commentHeader: defaultCharacterCommentHeader({ kind: "cast", display, series: "" }),
        };
        if (regionMode && region) {
          const s = regionSubjectFor(region);
          s.character = castObj;
          s.name = display;
          if (!s.identityTokens.includes(tok)) s.identityTokens.push(tok);
        } else {
          const letter = SUBJECT_LETTERS[letterIdx % 26] || "?";
          letterIdx++;
          currentSubj = {
            ...makeBlankSubject(letter, letterIdx),
            name: display,
            character: castObj,
            identityTokens: [tok],
          };
          newSubjects.push(currentSubj);
        }
        console.log(`✓ "${tok}" → ${castHit.item.item_tag} [cast-identity]`);
        continue;
      }

      if (MODIFIER_TOKENS.has(stripped)) {
        const subj = ensureSubject();
        if (!subj.modifiers.includes(stripped)) subj.modifiers.push(stripped);
        continue;
      }

      // Try direct tag match, then space→underscore (so "long hair" hits
      // the long_hair chip), then chip natlang (so "blonde golden hair"
      // hits a chip whose base_natlang is exactly that phrase).
      let lookup = tagToItem.get(stripped);
      let matchPath = lookup ? "tag" : null;
      if (!lookup && stripped.includes(" ")) {
        lookup = tagToItem.get(stripped.replace(/ /g, "_"));
        if (lookup) matchPath = "tag(space→_)";
      }
      if (!lookup) {
        lookup = chipByNatlang.get(stripped);
        if (lookup) matchPath = "chipByNatlang";
      }
      if (lookup) {
        const cat = CATEGORIES.find(c => c.bucket === lookup.bucket);
        if (cat?.scope === "global") {
          if (!newSceneSelections[lookup.group]) newSceneSelections[lookup.group] = [];
          if (!newSceneSelections[lookup.group].some(x => x.item_tag === lookup.item.item_tag)) {
            newSceneSelections[lookup.group].push(lookup.item);
          }
          console.log(`✓ "${tok}" → ${lookup.item.item_tag} [${matchPath}, scene]`);
          continue;
        }
        if (cat?.scope === "subject") {
          addChipToSubject(ensureSubject(), lookup);
          console.log(`✓ "${tok}" → ${lookup.item.item_tag} [${matchPath}, ${lookup.bucket}]`);
          continue;
        }
      }

      // Modifier rendered in natlang ("a single woman" etc).
      if (modifierByNatlang.has(stripped)) {
        const tokId = modifierByNatlang.get(stripped);
        const subj = ensureSubject();
        if (!subj.modifiers.includes(tokId)) subj.modifiers.push(tokId);
        console.log(`✓ "${tok}" → ${tokId} [modifier-natlang]`);
        continue;
      }

      // Modifier-stacked tag mode: "burgundy_torn_silk_cropped_sweater"
      // peels to base chip + customizer modifiers.
      const peeled = await peelTagModifiers(stripped);
      if (peeled) {
        const subj = ensureSubject();
        const stamped = { ...peeled.lookup.item, modifiers: peeled.modifiers };
        addChipToSubject(subj, { ...peeled.lookup, item: stamped });
        console.log(`✓ "${tok}" → ${peeled.lookup.item.item_tag} [peelTag]`);
        continue;
      }

      // Modifier-stacked natlang: "wearing a white t-shirt" peels to the
      // t-shirt chip.
      const peeledNl = await peelNatlangModifiers(stripped);
      if (peeledNl) {
        const subj = ensureSubject();
        const stamped = { ...peeledNl.lookup.item, modifiers: peeledNl.modifiers };
        addChipToSubject(subj, { ...peeledNl.lookup, item: stamped });
        console.log(`✓ "${tok}" → ${peeledNl.lookup.item.item_tag} [peelNatlang]`);
        continue;
      }

      // Furniture interaction ("sitting on a red velvet couch"): peel verb +
      // prop + mods and bind into furniture slot. The interaction line emits
      // as natlang even in tag mode, so this must run here too — not just in
      // the natlang parse path — or the prop won't repopulate on edit.
      const furnMatch = matchFurnitureInteraction(stripped);
      if (furnMatch) {
        const subj = ensureSubject();
        if (!subj.slots.furniture) subj.slots.furniture = {};
        if (!subj.slots.furniture[furnMatch.group]) subj.slots.furniture[furnMatch.group] = [];
        const arr = subj.slots.furniture[furnMatch.group];
        if (!arr.some(x => x.item_tag === furnMatch.chip.item_tag)) arr.push(furnMatch.chip);
        console.log(`✓ "${tok}" → ${furnMatch.chip.item_tag} [furniture-interaction]`);
        continue;
      }

      // Unrecognized: defer the routing decision. Whether this is subject or
      // scene freeform depends on what the rest of the prompt turns out to be
      // (did any subject content appear?) and the edit context — neither of
      // which we know yet. Carry the section hint + the subject active when it
      // appeared, and resolve after the loop.
      console.log(`✗ "${tok}" → deferred freeform`);
      pendingFreeform.push({ tok, section, subj: currentSubj, region });
    }
    console.groupEnd();

    // Resolve deferred freeform by CONTENT + edit context (comments only hint):
    //   • a global-scope edit (outside the regional blocks), or a chunk that
    //     sat under a // Scene header → global scene freeform;
    //   • otherwise it belongs to a subject — the one active when it appeared,
    //     else the first, else a fresh subject (a pure-freeform subject prompt).
    // A subject-scope edit with no recognized content still yields a subject
    // (the traditional "main prompt" behaviour); a global-scope edit never
    // fabricates one.
    for (const { tok, section, subj, region } of pendingFreeform) {
      // In-region freeform belongs to that block's subject, never the scene —
      // even under a global edit, the text physically sat inside the block.
      if (region) {
        const target = subj || regionSubjects.get(region);
        if (target) {
          const bucket = (section && target.sectionFreeform?.[section]) ? target.sectionFreeform[section] : target.freeform;
          if (!bucket.includes(tok)) bucket.push(tok);
          continue;
        }
      }
      if (editScope === "global" || section === "scene") {
        if (!newSceneFreeform.includes(tok)) newSceneFreeform.push(tok);
        continue;
      }
      const target = subj || newSubjects[0] || ensureSubject();
      const bucket = (section && target.sectionFreeform?.[section]) ? target.sectionFreeform[section] : target.freeform;
      if (!bucket.includes(tok)) bucket.push(tok);
    }

    for (const subj of newSubjects) {
      await detectOutfitsAndPosesFor(subj);
    }

    // Multi-comma chip claims from the pre-pass (chips whose own
    // base_natlang contains commas, e.g. armor / full-outfit chips). Route
    // each claim to its target: subject-scope to the first subject (or
    // spawn one if none), global-scope to scene selections.
    if (multiCommaClaims.length) {
      let claimSubj = newSubjects[0];
      if (!claimSubj && multiCommaClaims.some(c => CATEGORIES.find(x => x.bucket === c.bucket)?.scope === "subject")) {
        const letter = SUBJECT_LETTERS[letterIdx % 26] || "?";
        letterIdx++;
        claimSubj = makeBlankSubject(letter, letterIdx);
        newSubjects.push(claimSubj);
      }
      applyMultiCommaClaims(multiCommaClaims, claimSubj, newSceneSelections);
    }

    subjects = newSubjects;
    nextSubjectIdx = newSubjects.length;
    if (newSubjects.length) activeSubjectId = newSubjects[0].id;
    if (Object.keys(newSceneSelections).length) {
      sceneSelections = newSceneSelections;
      sceneSpawned = true;
    }
    sceneFreeform = newSceneFreeform;
    if (newSceneFreeform.length) sceneSpawned = true;
  }

  // Auto-generated section headers we re-emit ourselves on output. When
  // we see them in the input, drop them from passthrough so they don't
  // duplicate. Arbitrary user comments still pass through verbatim.
  const AUTO_HEADER_RE = /^\s*\/\/\s*(Character|Subject|Outfit|Pose|Scene|Style)\b/i;

  // Pure content match: scan the token stream for the longest preset
  // whose tag list appears as a contiguous run (with at least 70% of its
  // tags present in order). Comments are irrelevant — preset detection
  // is by tag pattern only. Returns the set of token indices to strip
  // from the chip stream (so they don't become freeform), and binds
  // activeStyle as a side effect. Longest preset wins on ties so a
  // 12-tag style outranks a 3-tag embedding snippet that overlaps it.
  //
  // After a successful match, walks back from the first matched token's
  // raw line for an immediately-preceding `// ...` comment header. If
  // found, that line is pulled out of passthrough and stored as the
  // style's commentHeader so the user's original header text is what we
  // re-emit on compose. If no header was there, commentHeader stays null
  // and compose emits no header.
  function detectAndBindStyle(tokenStream, rawLines, passthroughLineSet) {
    const stripIdx = new Set();
    if (!stylesCache.items?.length || !tokenStream.length) return stripIdx;

    const candidates = stylesCache.items
      .filter(it => it.tags?.length)
      .slice()
      .sort((a, b) => b.tags.length - a.tags.length);

    console.log(`[TagBuilder2] detectAndBindStyle: ${candidates.length} preset candidates against ${tokenStream.length} tokens`);

    // Bag-of-tags overlap: count how many of a preset's tags appear in
    // the stream (regardless of order, regardless of one-tag edits like
    // "detailed hair strands" → "detailed hair"). The matched indices
    // must form a reasonably tight span so a 1-tag embedding doesn't
    // claim a full prompt — span must not exceed ~2x the preset length.
    let bestPreset = null;
    let bestMatchedIdx = null;
    let bestScore = 0;
    for (const preset of candidates) {
      const presetTags = preset.tags;
      const usedStreamIdx = new Set();
      const matchedIdx = [];
      for (const ptag of presetTags) {
        for (let i = 0; i < tokenStream.length; i++) {
          if (usedStreamIdx.has(i)) continue;
          if (tokenStream[i].token === ptag) {
            usedStreamIdx.add(i);
            matchedIdx.push(i);
            break;
          }
        }
      }
      if (matchedIdx.length < 2) continue;
      const score = matchedIdx.length / presetTags.length;
      if (score < 0.7) continue;
      const sortedIdx = [...matchedIdx].sort((a, b) => a - b);
      const span = sortedIdx[sortedIdx.length - 1] - sortedIdx[0] + 1;
      const maxAllowedSpan = Math.max(presetTags.length * 2, 6);
      if (span > maxAllowedSpan) continue;
      // Prefer the highest score; on tie, prefer the longer preset.
      if (score > bestScore || (score === bestScore && presetTags.length > (bestPreset?.tags?.length || 0))) {
        bestScore = score;
        bestPreset = preset;
        bestMatchedIdx = sortedIdx;
      }
    }

    if (bestPreset) {
      let commentHeader = null;
      const firstLine = tokenStream[bestMatchedIdx[0]].rawLineIdx;
      for (let r = firstLine - 1; r >= 0; r--) {
        const ln = rawLines[r].trim();
        if (!ln) continue;
        if (/^\/\//.test(ln)) {
          commentHeader = rawLines[r];
          passthroughLineSet.delete(r);
        }
        break;
      }
      // Take the tags VERBATIM from the user's prompt span. This way an
      // edited form like "detailed hair" (canonical "detailed hair
      // strands") survives round-trip instead of being silently
      // overwritten to the preset's canonical phrasing on emit. The
      // preset's id/name still binds the active style, but the content
      // is the user's.
      const spanStart = bestMatchedIdx[0];
      const spanEnd = bestMatchedIdx[bestMatchedIdx.length - 1];
      const spanTags = [];
      for (let i = spanStart; i <= spanEnd; i++) {
        spanTags.push(tokenStream[i].token);
        stripIdx.add(i);
      }
      activeStyle = {
        id: bestPreset.item_tag,
        name: bestPreset.display_name,
        tags: spanTags,
        commentHeader,
      };
      styleSpawned = true;
      console.log(`[TagBuilder2] style matched: ${bestPreset.display_name} (${bestMatchedIdx.length}/${bestPreset.tags.length} tags, score=${bestScore.toFixed(2)}), span ${spanStart}..${spanEnd}, commentHeader: ${commentHeader ? JSON.stringify(commentHeader) : "<none>"}`);
    } else {
      console.log(`[TagBuilder2] no style matched`);
    }
    return stripIdx;
  }

  // Classify a `// …` comment line into one of the known section types,
  // or null when the header is a character/subject label / unrecognized.
  // Drives the parser's section-attribution pass so unrecognized chunks
  // can land back in the section they came from instead of subject body.
  function inferSectionFromHeader(line) {
    const text = (line || "").replace(/^\s*\/\/\s*/, "").trim();
    if (!text) return null;
    if (/^Outfit\b/i.test(text))      return "outfit";
    if (/^Pose\b/i.test(text))        return "pose";
    if (/^Interaction\b/i.test(text)) return "interaction";
    if (/^Scene\b/i.test(text))       return "scene";
    // Character / Subject / Style headers don't anchor freeform; their
    // content emits via the standard subject body / style paths. Return
    // null so chunks fall through to subj.freeform as before.
    return null;
  }

  // A header is "verbatim" when it's a hand-authored custom section the
  // builder never emits (e.g. "// 3D Style", "// Quality"). Its body must
  // be preserved as passthrough rather than tokenized into the subject —
  // otherwise the tags get absorbed into the subject body and the header
  // orphans. Managed headers (Subject/Character/Outfit/Pose/Interaction/
  // Scene/Style:) are NOT verbatim — their bodies parse as before.
  // A preset's own header (e.g. `// Figurine Default`) reads like a custom
  // section but is really a managed Style header — its body must tokenize so
  // detectAndBindStyle can content-match it. Matched against loaded presets by
  // name or by their parsed header text.
  function isKnownStyleHeader(text) {
    const norm = (text || "").trim().toLowerCase();
    if (!norm) return false;
    return !!stylesCache.items?.some(it =>
      (it.display_name || "").trim().toLowerCase() === norm ||
      (it.header || "").replace(/^\s*\/\/\s*/, "").trim().toLowerCase() === norm,
    );
  }

  function isVerbatimCustomHeader(line) {
    const text = (line || "").replace(/^\s*\/\/\s*/, "").trim();
    if (!text) return false;
    if (/^(Outfit|Pose|Interaction|Scene|Subject|Character)\b/i.test(text)) return false;
    if (/^Style\b/i.test(text) || /^Style:/i.test(text)) return false;
    if (isKnownStyleHeader(text)) return false;
    return true;
  }

  async function parseInitialPrompt(text) {
    const rawLines = text.split(/\r?\n/);
    regionMode = false;

    // Walk the raw lines once. Comments + blank padding + Negative Prompt:
    // block become passthrough (bookkeeping their raw-line indices so we
    // can pull a specific line back out later). Positive content lines
    // tokenize into a stream that also carries each token's raw-line
    // origin, so a style match can find its header comment if any.
    const passthroughLineSet = new Set(); // raw-line indices that go to passthrough
    const tokenStream = []; // [{ token, rawLineIdx }]
    const positiveContentLines = []; // raw text of tokenizable lines (periods intact)
    const positiveContentRawIdx = []; // parallel: each positive line's raw index
    // Parallel: true if this positive line is the first one after a `// …`
    // comment header in the raw text. The join-pass uses this to inject a
    // sentence boundary at section transitions so the previous section's
    // tail doesn't glue to the next section's head when chips lack a
    // trailing period (older emits, hand-edited prompts).
    const positiveContentSectionStart = [];
    // Parallel: which section this positive line belongs to (null = body /
    // character / unattributed; otherwise "outfit"|"pose"|"interaction"|
    // "scene"). Drives section-anchored freeform — unrecognized chunks
    // re-emit inside their original section instead of the subject body.
    const lineSections = [];
    // Parallel: which `$name{}` regional block each positive line sits in
    // (the `$name` token, e.g. "$mannequin2"), or null outside all blocks.
    // Drives per-block subject binding in region mode.
    const lineRegions = [];
    let pendingSectionBreak = false;
    let currentSection = null;
    let currentRegion = null;
    // True while inside a hand-authored custom section (e.g. "// 3D Style")
    // whose body should be preserved verbatim, not tokenized.
    let currentVerbatim = false;
    let inNegative = false;
    // The Negative Prompt: block's raw-line indices (marker + body) and its
    // body text. If a style binds below, the negative moves onto it so compose
    // emits it once from the style; otherwise it stays in passthrough.
    const negativeLineIdx = [];
    const negativeBodyLines = [];
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (inNegative) {
        passthroughLineSet.add(i);
        negativeLineIdx.push(i);
        if (line.trim()) negativeBodyLines.push(line.trim());
        continue;
      }
      if (/^Negative Prompt:\s*$/i.test(line.trim())) {
        inNegative = true;
        passthroughLineSet.add(i);
        negativeLineIdx.push(i);
        continue;
      }
      // Regional-block markers (region-highlight.js grammar): `$name {` opens,
      // a lone `}` closes. They're structural — compose rebuilds them from
      // each subject's regionName — so don't tokenize or pass them through.
      const regionOpen = line.match(/^\s*(\$[A-Za-z]\w*)\s*\{\s*$/);
      if (regionOpen) {
        currentRegion = regionOpen[1];
        regionMode = true;
        continue;
      }
      if (currentRegion && /^\s*\}\s*$/.test(line)) {
        currentRegion = null;
        continue;
      }
      if (/^\s*\/\//.test(line)) {
        passthroughLineSet.add(i);
        pendingSectionBreak = true;
        currentSection = inferSectionFromHeader(line);
        currentVerbatim = isVerbatimCustomHeader(line);
        continue;
      }
      if (!line.trim()) {
        passthroughLineSet.add(i);
        continue;
      }
      // Body of a custom verbatim section — keep it in passthrough exactly
      // as written instead of tokenizing it into the subject.
      if (currentVerbatim) {
        passthroughLineSet.add(i);
        continue;
      }
      positiveContentLines.push(line);
      positiveContentRawIdx.push(i);
      positiveContentSectionStart.push(pendingSectionBreak);
      lineSections.push(currentSection);
      lineRegions.push(currentRegion);
      pendingSectionBreak = false;
      for (const part of line.split(/,|\.\s+/)) {
        const t = part.trim().replace(/\.$/, "");
        if (t) tokenStream.push({ token: t, rawLineIdx: i });
      }
    }

    // Pattern: a contiguous run of tokens that equals (or near-equals) a
    // loaded preset's tag list IS the style. Strip those tokens from the
    // chip stream before chip matching so we don't double-classify.
    // detectAndBindStyle also looks back from the matched range for an
    // immediate `// ...` header line; if found, the line is removed from
    // passthrough and stored on activeStyle.commentHeader so on emit the
    // user's original header text is preserved (or absent if it wasn't
    // there).
    const stripIndices = detectAndBindStyle(tokenStream, rawLines, passthroughLineSet);

    // A bound style owns the negative: move it off passthrough and onto the
    // style so compose emits exactly one Negative Prompt: block (and a
    // deselect/reselect can't leave a stale copy behind in passthrough).
    if (activeStyle && negativeBodyLines.length) {
      activeStyle.negative = negativeBodyLines.join("\n");
      for (const i of negativeLineIdx) passthroughLineSet.delete(i);
    }

    preservedPassthrough = rawLines
      .filter((_, i) => passthroughLineSet.has(i))
      .join("\n");

    // Multi-comma chip pre-pass: chip natlangs containing commas (e.g. an
    // armor chip whose base_natlang is a 6-piece description) can't survive
    // the normal "split prompt on comma → chunk lookup" path because the
    // chip's own natlang is multi-chunk. Scan the joined text for those
    // chips, longest-first, and splice their spans out. The claimed
    // lookups ride along to whichever parse function runs next, so the
    // chip lands on the active subject / scene before the normal token
    // loop processes the leftover text.
    const mcChipList = buildMultiCommaChipList();
    // Insert ". " before each line that begins a new section so the boundary
    // survives the join. The first line is exempt (nothing to glue to).
    const naturalJoinedRaw = positiveContentLines
      .map((line, idx) => (idx > 0 && positiveContentSectionStart[idx]) ? ". " + line : line)
      .join(" ")
      .trim();
    const mcScan = scanMultiCommaChips(naturalJoinedRaw, mcChipList);
    if (mcScan.claims.length) {
      console.log(`[TagBuilder2] multi-comma chip claims: ${mcScan.claims.length}`, mcScan.claims.map(c => c.item.item_tag));
    }
    const naturalJoined = mcScan.remaining;

    // Try natlang mode first: does any known character's base_natlang
    // appear anywhere in the joined raw text as a chunk-bounded phrase?
    // Longest base_natlang wins. The match accepts the canonical form
    // (with or without trailing period) and requires sentence/comma
    // boundary characters on either side (or text edges) so we don't
    // bind on accidental substring overlaps.
    let natlangChar = null;
    let natlangMatchStart = -1;
    let natlangMatchEnd = -1;
    for (const c of normalizedCharacters) {
      if (!c.base_natlang) continue;
      const bn = c.base_natlang.replace(/\.\s*$/, "").trim();
      if (!bn) continue;
      let searchFrom = 0;
      while (searchFrom <= naturalJoined.length) {
        const at = naturalJoined.indexOf(bn, searchFrom);
        if (at < 0) break;
        const before = at === 0 ? "" : naturalJoined.charAt(at - 1);
        const after = naturalJoined.charAt(at + bn.length);
        const okBefore = at === 0 || /[.,;\s]/.test(before);
        const okAfter = after === "" || /[.,;\s]/.test(after);
        if (okBefore && okAfter) {
          natlangChar = c;
          natlangMatchStart = at;
          natlangMatchEnd = at + bn.length;
          break;
        }
        searchFrom = at + 1;
      }
      if (natlangChar) break;
    }
    // Region mode parses every `$name{}` block in one pass, binding each to its
    // own subject — the single-character natlang path can't express that, so
    // force tag mode when regional blocks are present.
    if (natlangChar && !regionMode) {
      // Phrases the style-pass claimed — natlang processing must skip
      // them so style content doesn't fall to freeform on the character.
      const styleSkip = new Set();
      for (const i of stripIndices) styleSkip.add(tokenStream[i].token);
      // Pull the user's original `// ...` line above the first positive
      // content line so we can re-emit it verbatim instead of generating
      // a duplicate `// Character: ...`.
      let charCommentHeader = null;
      const firstPosRawIdx = positiveContentRawIdx[0] ?? -1;
      for (let r = firstPosRawIdx - 1; r >= 0; r--) {
        const ln = rawLines[r].trim();
        if (!ln) continue;
        if (/^\/\//.test(ln)) {
          charCommentHeader = rawLines[r];
          passthroughLineSet.delete(r);
        }
        break;
      }
      preservedPassthrough = rawLines
        .filter((_, i) => passthroughLineSet.has(i))
        .join("\n");
      // Build sectionedChunks per-line so each chunk carries the section
      // it came from. The character chunk is dropped by exact-match (chars
      // appear bounded so chunk-split lifts them out as their own piece).
      // Multi-comma chips claimed by the pre-pass need their constituent
      // fragments suppressed too — otherwise re-splitting per line would
      // double-process them as freeform. Style-claimed tokens are handled
      // inside parseNatlangPrompt via skipPhrases.
      const charBase = (natlangChar.base_natlang || "").replace(/\.\s*$/, "").trim();
      const mcSkip = new Set();
      for (const claim of mcScan.claims) {
        const cn = (claim?.item?.base_natlang || "").trim().replace(/\.\s*$/, "");
        for (const part of cn.split(/,|\.\s+/)) {
          const t = part.trim().replace(/\.$/, "");
          if (t) mcSkip.add(t);
        }
      }
      const sectionedChunks = [];
      for (let lineIdx = 0; lineIdx < positiveContentLines.length; lineIdx++) {
        const sec = lineSections[lineIdx];
        for (const part of positiveContentLines[lineIdx].split(/,|\.\s+/)) {
          const phrase = part.trim().replace(/\.$/, "");
          if (!phrase) continue;
          if (charBase && phrase === charBase) continue;
          if (mcSkip.has(phrase)) continue;
          sectionedChunks.push({ phrase, section: sec });
        }
      }
      await parseNatlangPrompt(sectionedChunks, natlangChar, styleSkip, charCommentHeader, mcScan.claims);
      await maybeRouteToActiveStyle();
      return;
    }

    // Tag mode: capture the `// <name>` line above the first SUBJECT chip
    // block so the first subject's commentHeader + name reflect what the user
    // wrote. A global `// Scene` header is NOT a subject header — anchor on the
    // first non-scene content line so a scene-only edit (e.g. editing outside
    // the regional blocks) doesn't seed a phantom subject named "Scene". If no
    // header was found, pass explicit null so compose treats it as "user
    // deleted the header, don't re-inject". Removed from passthrough so it
    // doesn't duplicate on emit.
    let firstSubjectCommentHeader = null;
    const firstSubjLineIdx = lineSections.findIndex(s => s !== "scene");
    const headerAnchorRawIdx = firstSubjLineIdx >= 0 ? (positiveContentRawIdx[firstSubjLineIdx] ?? -1) : -1;
    for (let r = headerAnchorRawIdx - 1; r >= 0; r--) {
      const ln = rawLines[r].trim();
      if (!ln) continue;
      if (/^\/\//.test(ln)) {
        firstSubjectCommentHeader = rawLines[r];
        passthroughLineSet.delete(r);
      }
      break;
    }
    preservedPassthrough = rawLines
      .filter((_, i) => passthroughLineSet.has(i))
      .join("\n");

    // Section- + region-tagged chunks so the tag parser can route `// Scene`
    // content to the Scene card and bind each `$name{}` block to its own
    // subject. Map each token back to its line's section/region by raw index.
    const rawIdxToSection = new Map();
    const rawIdxToRegion = new Map();
    for (let k = 0; k < positiveContentRawIdx.length; k++) {
      rawIdxToSection.set(positiveContentRawIdx[k], lineSections[k]);
      rawIdxToRegion.set(positiveContentRawIdx[k], lineRegions[k]);
    }
    let sectionedTagChunks;
    if (mcScan.claims.length) {
      // The multi-comma pre-pass spliced + re-joined the text, so section
      // provenance is lost — these fall through as null-section (subject
      // body), as they did before. Style-claimed tokens stay filtered out.
      const styleSkipSet = new Set((activeStyle?.tags || []));
      sectionedTagChunks = naturalJoined
        .split(/,|\.\s+/)
        .map(s => s.trim().replace(/\.$/, ""))
        .filter(s => s && !styleSkipSet.has(s))
        .map(phrase => ({ phrase, section: null, region: null }));
    } else {
      sectionedTagChunks = tokenStream
        .filter((_, i) => !stripIndices.has(i))
        .map(t => ({
          phrase: t.token,
          section: rawIdxToSection.get(t.rawLineIdx) ?? null,
          region: rawIdxToRegion.get(t.rawLineIdx) ?? null,
        }));
    }

    // Explicit null vs undefined matters: null = round-tripped & no
    // header found → don't re-inject; undefined = never round-tripped →
    // auto-generate the default.
    await parseTagPrompt(sectionedTagChunks, firstSubjectCommentHeader, true, mcScan.claims);
    await maybeRouteToActiveStyle();
  }

  // Pull a friendly name out of a `// ...` line. Recognizes our auto
  // formats ("// Character: <X>", "// Subject: <X>") and falls back to
  // everything after the slashes for arbitrary user labels.
  function nameFromCommentHeader(line) {
    if (!line) return null;
    const m = /^\s*\/\/\s*(.+?)\s*$/.exec(line);
    if (!m) return null;
    const text = m[1].trim();
    const tagged = /^(?:Character|Subject):\s*(.+?)(?:\s*\([^)]+\))?\s*$/i.exec(text);
    if (tagged) return tagged[1].trim();
    return text;
  }

  // If round-trip parse bound a style and nothing landed on any subject,
  // the prompt is style-only — drop the user straight into the Styles
  // category and scroll the matched card into view.
  async function maybeRouteToActiveStyle() {
    if (!activeStyle) return;
    const anyChips = subjects.some(s =>
      (s.identityTokens?.length || 0) > 0 ||
      (s.modifiers?.length || 0) > 0 ||
      (s.freeform?.length || 0) > 0 ||
      Object.values(s.sectionFreeform || {}).some(arr => (arr?.length || 0) > 0) ||
      Object.values(s.slots || {}).some(cat =>
        Object.values(cat || {}).some(arr => (arr?.length || 0) > 0)
      )
    );
    if (anyChips) return;
    selectCategory("styles");
    await tick();
    if (!stylesCache.loaded) {
      await loadStyles();
      await tick();
    }
    const card = document.querySelector(
      `.pcr-atb2-card[data-item-tag="${CSS.escape(activeStyle.id)}"]`
    );
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function removeFreeform(subjId, token) {
    subjects = subjects.map(s =>
      s.id === subjId
        ? { ...s, freeform: (s.freeform || []).filter(t => t !== token) }
        : s
    );
  }

  function removeSectionFreeform(subjId, sectionKey, token) {
    subjects = subjects.map(s => {
      if (s.id !== subjId) return s;
      const cur = s.sectionFreeform || { outfit: [], pose: [], interaction: [], scene: [] };
      const next = { ...cur, [sectionKey]: (cur[sectionKey] || []).filter(t => t !== token) };
      return { ...s, sectionFreeform: next };
    });
  }

  function removeIdentityToken(subjId, token) {
    // The identity-chip × represents "remove the identity binding",
    // mirroring the dropdown's × button. Delegate to unbindIdentity so
    // subj.character clears too and compose stops prepending base_natlang.
    unbindIdentity(subjId);
  }

  function toggleModifier(subjId, token) {
    subjects = subjects.map(s => {
      if (s.id !== subjId) return s;
      const cur = s.modifiers || [];
      if (cur.includes(token)) return { ...s, modifiers: cur.filter(t => t !== token) };
      // solo/solo_focus layer on top of whatever count is set; a new count
      // replaces any existing count (drop all non-composition modifiers).
      if (COMPOSITION_MODIFIERS.has(token)) return { ...s, modifiers: [...cur, token] };
      const kept = cur.filter(t => COMPOSITION_MODIFIERS.has(t));
      return { ...s, modifiers: [...kept, token] };
    });
  }

  function removeModifier(subjId, token) {
    subjects = subjects.map(s =>
      s.id === subjId
        ? { ...s, modifiers: (s.modifiers || []).filter(t => t !== token) }
        : s
    );
  }

  function openModifierPicker(subjId, triggerEl) {
    modifierPickerOpen = subjId;
    if (triggerEl) {
      const r = triggerEl.getBoundingClientRect();
      modifierPickerRect = {
        left: r.left,
        top: r.bottom + 4,
        width: 280,
      };
    }
  }

  function closeModifierPicker() {
    modifierPickerOpen = null;
  }

  $effect(() => {
    if (modifierPickerOpen === null) return;
    function onDocClick(e) {
      if (e.target.closest('.pcr-atb2-modifier-dd')) return;
      if (e.target.closest('.pcr-atb2-modifier-trigger')) return;
      closeModifierPicker();
    }
    // Add directly — this $effect runs after the opening click has finished
    // dispatching, so the capture-phase listener can't catch that same click
    // (no setTimeout(0) deferral needed).
    document.addEventListener('click', onDocClick, true);
    return () => document.removeEventListener('click', onDocClick, true);
  });

  // What token should partitionTokens treat as the identity assertion in
  // base_tags? For characters it's the character tag (the canonical
  // "(cammy_white:1.1)"-style chip). For cast items the tag is internal
  // (e.g. "archetype_motherly") and never appears in base_tags — instead
  // base_tags leads with a clean version like "motherly", so we use the
  // first base_tags token as the identity match.
  function identityMatchToken(option) {
    if (option?.kind === "cast") {
      const first = (option.base_tags || "").split(",").map(s => s.trim()).filter(Boolean)[0];
      return first || option.tag;
    }
    return option?.tag || "";
  }

  // Split a freeform list three ways: identity (just the character tag),
  // modifiers (count/solo tokens), free (everything else).
  function partitionTokens(tokens, characterTag) {
    const identity = [];
    const modifiers = [];
    const free = [];
    for (const tok of tokens || []) {
      const stripped = tok
        .replace(/^\((.+):\s*\d+(?:\.\d+)?\)$/, "$1")
        .replace(/^\((.+)\)$/, "$1");
      if (characterTag && stripped === characterTag) identity.push(tok);
      else if (MODIFIER_TOKENS.has(stripped)) modifiers.push(tok);
      else free.push(tok);
    }
    return { identity, modifiers, free };
  }

  function deleteSubject(id) {
    subjects = subjects.filter(s => s.id !== id);
    if (activeSubjectId === id) activeSubjectId = null;
    if (identityPickerOpen === id) closeIdentityPicker();
    if (presetPickerOpen?.subjId === id) closePresetPicker();
  }

  function spawnScene() {
    sceneSpawned = true;
  }

  function deleteScene() {
    sceneSpawned = false;
    sceneSelections = {};
    sceneFreeform = [];
  }

  function removeSceneFreeform(tok) {
    sceneFreeform = sceneFreeform.filter(t => t !== tok);
  }

  function setActiveSubject(id) {
    activeSubjectId = activeSubjectId === id ? null : id;
  }

  // Jump from a subject card's "+ add" link to the matching rail group:
  // focus this subject, switch the active category + group so a click in the
  // middle browser lands in this exact slot.
  function jumpToSlot(subjId, catKey, grpName) {
    activeSubjectId = subjId;
    activeCategory = catKey;
    activeGroup = grpName;
  }

  // Click-to-navigate from a chip back to where it was sourced from.
  // category/group point at the rail target; itemTag is what to scroll
  // into view + flash. Subject chips refocus the originating subject.
  function jumpToTag({ subjId, category, group, itemTag, query }) {
    if (subjId) activeSubjectId = subjId;
    if (category) activeCategory = category;
    activeGroup = group ?? null;
    if (category === "subjects") activeSubjectSubitem = null;
    // Set the debounced copy synchronously too — the item must render this
    // tick so the scrollToItemTag effect can find and flash it.
    searchQuery = query || "";
    debouncedQuery = query || "";
    if (itemTag) scrollToItemTag = itemTag;
  }

  function jumpToModifier(subjId, token) {
    jumpToTag({
      subjId,
      category: "appearance",
      group: MODIFIER_GROUP_KEY,
      itemTag: token,
    });
  }

  function jumpToIdentity(subjId) {
    jumpToTag({ subjId, category: "subjects" });
  }

  function jumpToSlotChip(subjId, catKey, grpName, itemTag) {
    jumpToTag({ subjId, category: catKey, group: grpName, itemTag });
  }

  $effect(() => {
    if (!scrollToItemTag) return;
    const tag = scrollToItemTag;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-item-tag="${CSS.escape(tag)}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("pcr-atb2-flash");
          // Remove on animationend (the .pcr-atb2-flash rule runs pcrAtb2Flash
          // 1s once) so re-jumping to the same card re-triggers it — no timer.
          el.addEventListener("animationend", () => el.classList.remove("pcr-atb2-flash"), { once: true });
        }
      });
    });
    scrollToItemTag = null;
  });

  function renameSubject(id, name) {
    // Editing the input also updates the section's `// <Name>` line so
    // they don't drift apart. We rewrite commentHeader to `// <name>`;
    // bound characters keep their full `// Character: <X> (<series>)`
    // form so the character display + series stay intact.
    subjects = subjects.map(s => {
      if (s.id !== id) return s;
      const next = { ...s, name };
      if (s.character) {
        const series = s.character.series ? ` (${s.character.series})` : "";
        next.character = {
          ...s.character,
          commentHeader: `// Character: ${name}${series}`,
        };
      } else {
        next.commentHeader = name.trim() ? `// ${name}` : null;
      }
      return next;
    });
  }

  function toggleSubjectSection(subjId, catKey) {
    subjects = subjects.map(s => {
      if (s.id !== subjId) return s;
      const cur = s.expandedSections || {};
      return { ...s, expandedSections: { ...cur, [catKey]: !cur[catKey] } };
    });
  }

  // ----------------------------------------------------------------------
  //  ITEM CLICK ROUTING
  // ----------------------------------------------------------------------

  // Click handler used by the All-view section grids — knows the
  // originating category/group so it can route correctly without
  // depending on activeCategory state.
  function pickItemFromAll(item, categoryKey, groupKey) {
    if (groupKey === MODIFIER_GROUP_KEY) {
      let subj = activeSubject;
      if (!subj) subj = spawnSubject("person");
      toggleModifier(subj.id, item.item_tag);
      return;
    }
    recordRecent({ type: "item", categoryKey, groupKey, item });
    const cat = CATEGORIES.find(c => c.key === categoryKey);
    if (!cat) return;
    if (cat.scope === "furniture") {
      // No subject + no modifiers to configure = nothing for the
      // customizer to ask. Drop straight into the scene bag.
      if (!activeSubject && !item.is_customizable) {
        if (!sceneSpawned) sceneSpawned = true;
        sceneSelections = toggleInBag(sceneSelections, item.item_group, item, true);
        return;
      }
      openFurnitureCustomizer(item, activeSubject || null);
      return;
    }
    const isMulti = (MULTI_GROUPS[cat.bucket] || new Set()).has(groupKey);
    if (cat.scope === "global") {
      if (!sceneSpawned) sceneSpawned = true;
      sceneSelections = toggleInBag(sceneSelections, groupKey, item, isMulti);
      return;
    }
    let subj = activeSubject;
    if (!subj) subj = spawnSubject("person");
    if (isCustomizableClothing(categoryKey, groupKey)) {
      const existing = subj.slots[categoryKey]?.[groupKey]?.find(x => x.item_tag === item.item_tag);
      if (!existing) {
        // Not yet in slot — open customizer to pick modifiers + add.
        openCustomizerForNewPick(item, subj, categoryKey, groupKey);
        return;
      }
      // Already in slot — fall through to toggleInBag, which removes it.
      // (The mod-dot is the path to edit modifiers without removing.)
    }
    if (isCustomizableAppearance(categoryKey, groupKey)) {
      const existing = subj.slots[categoryKey]?.[groupKey]?.find(x => x.item_tag === item.item_tag);
      if (!existing) {
        openFantasyCustomizerForNewPick(item, subj);
        return;
      }
    }
    const catSlots = subj.slots[categoryKey] || {};
    const nextSlots = toggleInBag(catSlots, groupKey, item, isMulti);
    subjects = subjects.map(s =>
      s.id === subj.id
        ? { ...s, slots: { ...s.slots, [categoryKey]: nextSlots } }
        : s
    );
  }

  function isSelectedInCategory(item, categoryKey, groupKey) {
    if (groupKey === MODIFIER_GROUP_KEY) {
      return !!activeSubject?.modifiers?.includes(item.item_tag);
    }
    const cat = CATEGORIES.find(c => c.key === categoryKey);
    if (!cat) return false;
    if (cat.scope === "global") {
      const arr = sceneSelections[groupKey] || [];
      return arr.some(s => s.item_tag === item.item_tag);
    }
    // Props in scene context (no subject) live in sceneSelections under
    // the prop category — non-customizable picks land there directly.
    if (cat.scope === "furniture" && !activeSubject) {
      const arr = sceneSelections[groupKey] || [];
      return arr.some(s => s.item_tag === item.item_tag || s._furniture?.prop_tag === item.item_tag);
    }
    if (!activeSubject) return false;
    const arr = activeSubject.slots[categoryKey]?.[groupKey] || [];
    // Furniture chips carry a synthetic item_tag but reference the prop via
    // _furniture.prop_tag — match either so the prop card highlights.
    return arr.some(s => s.item_tag === item.item_tag || s._furniture?.prop_tag === item.item_tag);
  }

  function pickItem(item) {
    const grp = item.item_group;
    const isMulti = (MULTI_GROUPS[activeBucket] || new Set()).has(grp);

    if (activeCategoryDef.scope === "furniture") {
      // No subject + no modifiers to configure = nothing for the
      // customizer to ask. Drop straight into the scene bag.
      if (!activeSubject && !item.is_customizable) {
        if (!sceneSpawned) sceneSpawned = true;
        sceneSelections = toggleInBag(sceneSelections, item.item_group, item, true);
        return;
      }
      openFurnitureCustomizer(item, activeSubject || null);
      return;
    }

    if (activeCategoryDef.scope === "global") {
      if (!sceneSpawned) sceneSpawned = true;
      sceneSelections = toggleInBag(sceneSelections, grp, item, isMulti);
      return;
    }

    if (activeCategoryDef.scope === "style") {
      pickStyle(item);
      return;
    }

    // Appearance > Modifiers sub-item: toggle on subject's modifiers list
    // instead of into a slot.
    if (activeCategory === "appearance" && activeGroup === MODIFIER_GROUP_KEY) {
      let subj = activeSubject;
      if (!subj) subj = spawnSubject("person");
      toggleModifier(subj.id, item.item_tag);
      return;
    }

    // Per-subject: find or auto-spawn
    let subj = activeSubject;
    if (!subj) subj = spawnSubject("person");

    const catKey = activeCategory;
    if (isCustomizableClothing(catKey, grp)) {
      const existing = subj.slots[catKey]?.[grp]?.find(x => x.item_tag === item.item_tag);
      if (!existing) {
        openCustomizerForNewPick(item, subj, catKey, grp);
        return;
      }
      // Already in slot — fall through to toggleInBag (removes it).
    }
    if (isCustomizableAppearance(catKey, grp)) {
      const existing = subj.slots[catKey]?.[grp]?.find(x => x.item_tag === item.item_tag);
      if (!existing) {
        openFantasyCustomizerForNewPick(item, subj);
        return;
      }
    }
    const catSlots = subj.slots[catKey] || {};
    const nextSlots = toggleInBag(catSlots, grp, item, isMulti);

    subjects = subjects.map(s =>
      s.id === subj.id
        ? { ...s, slots: { ...s.slots, [catKey]: nextSlots } }
        : s
    );
  }

  function toggleInBag(bag, grp, item, isMulti) {
    const arr = bag[grp] || [];
    const exists = arr.some(s => s.item_tag === item.item_tag);
    if (exists) {
      const filtered = arr.filter(s => s.item_tag !== item.item_tag);
      const next = { ...bag };
      if (filtered.length) next[grp] = filtered; else delete next[grp];
      return next;
    }
    if (isMulti) return { ...bag, [grp]: [...arr, item] };
    return { ...bag, [grp]: [item] };
  }

  function clearSceneChip(grp, itemTag) {
    const arr = sceneSelections[grp] || [];
    const filtered = arr.filter(s => s.item_tag !== itemTag);
    const next = { ...sceneSelections };
    if (filtered.length) next[grp] = filtered; else delete next[grp];
    sceneSelections = next;
  }

  function clearSubjectChip(subjId, catKey, grp, itemTag) {
    subjects = subjects.map(s => {
      if (s.id !== subjId) return s;
      const cat = s.slots[catKey] || {};
      const arr = cat[grp] || [];
      const filtered = arr.filter(x => x.item_tag !== itemTag);
      const nextCat = { ...cat };
      if (filtered.length) nextCat[grp] = filtered; else delete nextCat[grp];
      const nextSlots = { ...s.slots };
      if (Object.keys(nextCat).length) nextSlots[catKey] = nextCat; else delete nextSlots[catKey];
      return { ...s, slots: nextSlots };
    });
  }

  function isSelected(item) {
    if (activeCategoryDef.scope === "global") {
      const arr = sceneSelections[item.item_group] || [];
      return arr.some(s => s.item_tag === item.item_tag);
    }
    if (activeCategoryDef.scope === "style") {
      return activeStyle?.id === item.item_tag;
    }
    if (activeCategory === "appearance" && activeGroup === MODIFIER_GROUP_KEY) {
      return !!activeSubject?.modifiers?.includes(item.item_tag);
    }
    // Props in scene context (no subject) — non-customizable picks land
    // in sceneSelections, customized ones get the _furn_ synthetic tag.
    if (activeCategoryDef.scope === "furniture" && !activeSubject) {
      const arr = sceneSelections[item.item_group] || [];
      return arr.some(s => s.item_tag === item.item_tag || s._furniture?.prop_tag === item.item_tag);
    }
    if (!activeSubject) return false;
    const arr = activeSubject.slots[activeCategory]?.[item.item_group] || [];
    // Match furniture chips by their referenced prop (synthetic item_tag).
    return arr.some(s => s.item_tag === item.item_tag || s._furniture?.prop_tag === item.item_tag);
  }

  // ----------------------------------------------------------------------
  //  CUSTOMIZER (clothing modifiers)
  // ----------------------------------------------------------------------

  // Idempotent loader for the v1 customizer endpoint. Same caching pattern
  // as loadBucket / loadCast — second call returns the in-flight promise.
  function loadClothingMods(group) {
    if (!group) return Promise.resolve(null);
    if (clothingModData[group]) return Promise.resolve(clothingModData[group]);
    if (clothingModPromises[group]) return clothingModPromises[group];
    clothingModPromises[group] = (async () => {
      try {
        const res = await fetch(`/promptchain/clothing/customizer-data?group=${encodeURIComponent(group)}`);
        const data = res.ok ? await res.json() : { colors: [], patterns: [], materials: [], conditions: [] };
        clothingModData = { ...clothingModData, [group]: data };
        return data;
      } catch {
        const data = { colors: [], patterns: [], materials: [], conditions: [] };
        clothingModData = { ...clothingModData, [group]: data };
        return data;
      } finally {
        delete clothingModPromises[group];
      }
    })();
    return clothingModPromises[group];
  }

  function isCustomizableClothing(catKey, grp) {
    return catKey === "clothing" && CUSTOMIZABLE_CLOTHING_GROUPS.has((grp || "").toLowerCase());
  }

  function isCustomizableAppearance(catKey, grp) {
    return catKey === "appearance" && CUSTOMIZABLE_APPEARANCE_GROUPS.has((grp || "").toLowerCase());
  }

  function isCustomizableSlot(catKey, grp) {
    return isCustomizableClothing(catKey, grp) || isCustomizableAppearance(catKey, grp);
  }

  function loadFantasyMods() {
    if (fantasyModData) return Promise.resolve(fantasyModData);
    if (fantasyModPromise) return fantasyModPromise;
    fantasyModPromise = (async () => {
      try {
        const res = await fetch("/promptchain/fantasy/customizer-data");
        const data = res.ok ? await res.json() : { shapes: [], colors: [], types: [] };
        fantasyModData = data;
        return data;
      } catch {
        const data = { shapes: [], colors: [], types: [] };
        fantasyModData = data;
        return data;
      } finally {
        fantasyModPromise = null;
      }
    })();
    return fantasyModPromise;
  }

  // Per-color emit overrides — used when the tag-mode emission needs
  // to differ from the DB `prefix`. Natlang uses the DB prefix directly.
  // Example: nude (display "Transparent", prefix "transparent") still
  // wants to emit as "see-through" in SDXL tag form.
  const COLOR_EMIT_OVERRIDE = {
    nude: { tag: "see-through" },
  };
  // Reverse table for round-trip parsing: input aliases that peel back
  // to a canonical color tag. The DB prefix already covers "transparent";
  // this catches the alternate tag-mode spelling so re-parsed prompts
  // bind to nude even when SDXL form was used.
  const COLOR_INPUT_OVERRIDE = {
    "see-through": "nude",
    "see through": "nude",
  };

  // Same fallback table as Customizer.svelte for tags whose names aren't
  // valid CSS color identifiers. Kept in sync deliberately.
  const CHIP_COLOR_HEX = {
    burgundy: "#800020", wine: "#722f37", rose: "#ff66cc", blush: "#de5d83",
    coral: "#ff7f50", salmon: "#fa8072", peach: "#ffcba4", mustard: "#ffdb58",
    olive: "#808000", sage: "#9caf88", forest: "#228b22", mint: "#98ff98",
    teal: "#008080", turquoise: "#40e0d0", navy: "#000080", royal: "#4169e1",
    cobalt: "#0047ab", indigo: "#4b0082", plum: "#8e4585", lavender: "#e6e6fa",
    lilac: "#c8a2c8", cream: "#ffe69f", beige: "#f5f5dc", tan: "#d2b48c",
    khaki: "#c3b091", bronze: "#cd7f32", copper: "#b87333", rust: "#b7410e",
    chocolate: "#7b3f00", charcoal: "#36454f", brown: "#5d2d19",
    grey: "#636363", gray: "#636363",
  };

  function customizerColorHex(tag) {
    if (!tag) return null;
    return CHIP_COLOR_HEX[tag] || tag;
  }

  // Hover tooltip on the cap — show the full applied phrase so the user
  // can see what's set without opening the modal. Lazily loads the chip's
  // group customizer data so the prefixes resolve even on first render.
  // Fantasy chips route to the fantasy vocab; everything else falls back
  // to the clothing vocab cache.
  function modifierTooltip(item) {
    if (!item.modifiers) return "";
    if (item.item_group === "fantasy") {
      if (!fantasyModData) loadFantasyMods();
      return buildFantasyPhrase(item, item.modifiers, "natlang") || "";
    }
    if (!clothingModData[item.item_group]) loadClothingMods(item.item_group);
    const phrase = buildModifiedPhrase(item, item.modifiers, "natlang");
    return phrase || "";
  }

  function openCustomizerForNewPick(item, subj, catKey, grp) {
    // Warm the parent's cache so chipText's modifier emit gets the
    // vocab on next render. The modal makes its own fetch, but the
    // parent emit path uses clothingModData.
    loadClothingMods(item.item_group);
    customizerOpen = {
      item, subjId: subj.id, catKey, grp, isNew: true, initial: null,
    };
  }

  function openCustomizerForExisting(subjId, catKey, grp, item) {
    loadClothingMods(item.item_group);
    customizerOpen = {
      item, subjId, catKey, grp, isNew: false, initial: item.modifiers || null,
    };
  }

  function openFantasyCustomizerForNewPick(item, subj) {
    loadFantasyMods();
    fantasyCustomizerOpen = {
      item, subjId: subj.id, catKey: "appearance", grp: "fantasy",
      isNew: true, initial: null,
    };
  }

  function openFantasyCustomizerForExisting(subjId, item) {
    loadFantasyMods();
    fantasyCustomizerOpen = {
      item, subjId, catKey: "appearance", grp: "fantasy",
      isNew: false, initial: item.modifiers || null,
    };
  }

  function cancelFantasyCustomizer() { fantasyCustomizerOpen = null; }

  function commitFantasyCustomizer({ modifiers }) {
    if (!fantasyCustomizerOpen) return;
    const { item, subjId, catKey, grp, isNew } = fantasyCustomizerOpen;
    fantasyCustomizerOpen = null;

    subjects = subjects.map(s => {
      if (s.id !== subjId) return s;
      const catSlots = s.slots[catKey] || {};
      const arr = catSlots[grp] || [];
      let nextArr;
      if (isNew) {
        if (arr.some(x => x.item_tag === item.item_tag)) {
          nextArr = arr.map(x => x.item_tag === item.item_tag ? { ...x, modifiers } : x);
        } else {
          nextArr = [...arr, { ...item, modifiers }];
        }
      } else {
        nextArr = arr.map(x => x.item_tag === item.item_tag ? { ...x, modifiers } : x);
      }
      const nextGrp = { ...catSlots, [grp]: nextArr };
      return { ...s, slots: { ...s.slots, [catKey]: nextGrp } };
    });
  }

  // Look up the slot version of a card's item (if any) to mirror its
  // modifier state on the card's dot. Returns null when the item isn't
  // currently in the active subject's slot.
  function cardModifiers(item, catKey, grp) {
    if (!activeSubject) return null;
    const found = activeSubject.slots[catKey]?.[grp]?.find(x => x.item_tag === item.item_tag);
    return found?.modifiers || null;
  }

  // Card dot click — opens the customizer to edit modifiers without
  // toggling the card's selection state. Dispatches by category so
  // appearance > fantasy gets the FantasyCustomizer and clothing gets
  // the clothing Customizer.
  function editCardModifiers(item, catKey, grp) {
    if (!activeSubject) return;
    const found = activeSubject.slots[catKey]?.[grp]?.find(x => x.item_tag === item.item_tag);
    if (!found) return;
    if (isCustomizableAppearance(catKey, grp)) {
      openFantasyCustomizerForExisting(activeSubject.id, found);
    } else {
      openCustomizerForExisting(activeSubject.id, catKey, grp, found);
    }
  }

  function commitCustomizer({ modifiers }) {
    if (!customizerOpen) return;
    const { item, subjId, catKey, grp, isNew } = customizerOpen;
    customizerOpen = null;

    subjects = subjects.map(s => {
      if (s.id !== subjId) return s;
      const cat = { ...(s.slots[catKey] || {}) };
      const arr = cat[grp] || [];
      const isMulti = (MULTI_GROUPS[CATEGORIES.find(c => c.key === catKey)?.bucket] || new Set()).has(grp);

      const stamped = { ...item };
      if (modifiers) stamped.modifiers = modifiers; else delete stamped.modifiers;

      let nextArr;
      if (isNew) {
        const exists = arr.some(x => x.item_tag === item.item_tag);
        if (exists) {
          nextArr = arr.map(x => x.item_tag === item.item_tag ? stamped : x);
        } else if (isMulti) {
          nextArr = [...arr, stamped];
        } else {
          nextArr = [stamped];
        }
      } else {
        nextArr = arr.map(x => x.item_tag === item.item_tag ? stamped : x);
      }
      cat[grp] = nextArr;
      return { ...s, slots: { ...s.slots, [catKey]: cat } };
    });
  }

  function cancelCustomizer() { customizerOpen = null; }

  // ----------------------------------------------------------------------
  //  FURNITURE CUSTOMIZER
  // ----------------------------------------------------------------------

  function openFurnitureCustomizer(item, subj) {
    // Ensure furniture bucket + actions are loaded so the modal has its
    // vocab on first render. The modal also reads from bucketCache.furniture.mods.
    loadFurniture().then(() => {
      furnitureCustomizerOpen = {
        item,
        subjId: subj?.id || null,
        sceneGroup: item.item_group,
        isNew: true,
        initial: null,
      };
    });
  }

  function openFurnitureCustomizerForExisting(chip, subjId, sceneGroup) {
    // `chip._furniture` is the round-trip metadata stashed at commit time.
    // Look up the canonical prop row so is_customizable + subCategory are
    // fresh from the loaded data — chips from old prompts may not carry
    // those, and we want the re-edit flow to render the right rows.
    loadFurniture().then(() => {
      const propRow = (bucketCache.furniture?.items || []).find(p => p.item_tag === chip._furniture.prop_tag);
      furnitureCustomizerOpen = {
        item: {
          item_tag: chip._furniture.prop_tag,
          display_name: chip._furniture.prop_display,
          item_group: propRow?.item_group || sceneGroup,
          base_tags: propRow?.base_tags || chip._furniture.prop_tag,
          base_natlang: propRow?.base_natlang || chip._furniture.prop_display.toLowerCase(),
          is_customizable: propRow?.is_customizable ?? !!(chip._furniture.material || chip._furniture.pattern),
          subCategory: propRow?.subCategory || null,
        },
        subjId,
        sceneGroup,
        isNew: false,
        // The existing chip's item_tag — kept for in-place replacement.
        existingTag: chip.item_tag,
        initial: {
          material: chip._furniture.material || "",
          pattern: chip._furniture.pattern || "",
          color: chip._furniture.color || "",
          action: chip._furniture.action || "",
        },
      };
    });
  }

  function cancelFurnitureCustomizer() { furnitureCustomizerOpen = null; }

  function commitFurnitureCustomizer(result) {
    if (!furnitureCustomizerOpen) return;
    const { item, subjId, sceneGroup, isNew, existingTag } = furnitureCustomizerOpen;
    furnitureCustomizerOpen = null;

    const { material, pattern, color, action, assembled, parts } = result;

    // Build the display label readers see on the chip. Mirrors v1's
    // PropsCustomizerModal.handleConfirm.displayParts ordering: action,
    // color, pattern, material, then the prop display.
    const labelParts = [];
    if (parts?.actionOpt?.display_name) labelParts.push(parts.actionOpt.display_name);
    if (parts?.colorOpt?.display) labelParts.push(parts.colorOpt.display);
    if (parts?.patternOpt?.display) labelParts.push(parts.patternOpt.display);
    if (parts?.materialOpt?.display) labelParts.push(parts.materialOpt.display);
    labelParts.push(item.display_name || item.item_tag);

    // Synthetic stable tag so re-customizing the same (prop, action) combo
    // updates in place instead of duplicating. Including the action here is
    // intentional: one subject can have multiple distinct interactions with
    // the same prop only if the verbs differ (rare but legal).
    const syntheticTag = isNew
      ? `_furn_${item.item_tag}_${action || "x"}_${color || "x"}_${material || "x"}_${pattern || "x"}`
      : existingTag;

    const chip = {
      item_tag: syntheticTag,
      display_name: labelParts.join(" "),
      item_group: sceneGroup,
      // Pre-baked emit strings — itemText/chipText return these unchanged,
      // so no special-casing in the compose path.
      base_tags: assembled?.tags || item.base_tags || item.item_tag,
      base_natlang: assembled?.natlang || item.base_natlang || item.display_name?.toLowerCase() || item.item_tag,
      // QA status not tracked for synthetic chips — they'd otherwise inherit
      // the prop's base status and render red.
      natlang_status: "normalized",
      // Round-trip metadata for re-edit.
      _furniture: {
        prop_tag: item.item_tag,
        prop_display: item.display_name,
        material: material || null,
        pattern: pattern || null,
        color: color || null,
        action: action || null,
      },
    };

    if (subjId) {
      // Subject interaction — land in subj.slots.furniture.<group>.
      subjects = subjects.map(s => {
        if (s.id !== subjId) return s;
        const slots = { ...(s.slots || {}) };
        const cat = { ...(slots.furniture || {}) };
        const arr = cat[sceneGroup] || [];
        let nextArr;
        if (!isNew) {
          nextArr = arr.map(x => x.item_tag === existingTag ? chip : x);
        } else if (arr.some(x => x.item_tag === chip.item_tag)) {
          nextArr = arr.map(x => x.item_tag === chip.item_tag ? chip : x);
        } else {
          nextArr = [...arr, chip];
        }
        cat[sceneGroup] = nextArr;
        slots.furniture = cat;
        return { ...s, slots };
      });
    } else {
      // Scene element — land in sceneSelections.<furniture group>.
      if (!sceneSpawned) sceneSpawned = true;
      const next = { ...sceneSelections };
      const arr = next[sceneGroup] || [];
      let nextArr;
      if (!isNew) {
        nextArr = arr.map(x => x.item_tag === existingTag ? chip : x);
      } else if (arr.some(x => x.item_tag === chip.item_tag)) {
        nextArr = arr.map(x => x.item_tag === chip.item_tag ? chip : x);
      } else {
        nextArr = [...arr, chip];
      }
      next[sceneGroup] = nextArr;
      sceneSelections = next;
    }
  }

  // True for chips that came out of FurnitureCustomizer — those have
  // _furniture metadata stashed for re-edit. Used by chip rendering to
  // surface a cap that re-opens the customizer.
  function isFurnitureChip(chip) {
    return !!chip?._furniture;
  }

  // Build the modifier-prefixed phrase for a fantasy chip:
  //   tag mode → "<shape>_<color>_<type>_<chip>" (skipping empty parts)
  //   natlang  → "<shape> <color> <type> <chip>"
  // Vocab comes from /promptchain/fantasy/customizer-data; base_tags is
  // a comma list with the primary spelling first ("feathered, feathers").
  // Triggers a lazy load on first call so workflow-reloaded chips compose
  // correctly once the fetch settles (Svelte re-renders on state change).
  function buildFantasyPhrase(item, mods, mode) {
    if (!fantasyModData) { loadFantasyMods(); return null; }
    const find = (list, tag) => (list || []).find(o => o.tag === tag);
    const shape = mods?.shape ? find(fantasyModData.shapes, mods.shape) : null;
    const color = mods?.color ? find(fantasyModData.colors, mods.color) : null;
    const type  = mods?.type  ? find(fantasyModData.types,  mods.type)  : null;
    // base_tags is comma-separated alts; first one is the primary spelling.
    const primary = (row) => (row?.base_tags || row?.tag || "").split(",")[0].trim();
    const parts = [shape, color, type].map(primary).filter(Boolean);

    if (mode === "tag") {
      const itemTag = item.item_tag || "";
      if (!parts.length) return itemTag;
      const slug = (s) => s.replace(/\s+/g, "_");
      return [...parts.map(slug), itemTag].join("_");
    }
    const base = (item.display_name || item.item_tag || "").toLowerCase();
    return [...parts, base].join(" ");
  }

  // Build the modifier-prefixed phrase for a customized chip. Used by
  // chipText() in both natlang and tag modes.
  //   tag mode    → underscore-joined ("burgundy_torn_silk_cropped_sweater")
  //   natlang     → space-joined      ("burgundy torn silk cropped sweater")
  // The order matches v1's _api_clothing_assemble: condition, color,
  // pattern, material, then the chip itself.
  function buildModifiedPhrase(item, mods, mode) {
    const data = clothingModData[item.item_group];
    if (!data) return null;  // vocab not loaded yet — caller falls back
    const find = (list, tag) => (list || []).find(o => o.tag === tag);
    const condition = mods?.condition ? find(data.conditions, mods.condition) : null;
    const color = mods?.color ? find(data.colors, mods.color) : null;
    const pattern = mods?.pattern ? find(data.patterns, mods.pattern) : null;
    const material = mods?.material ? find(data.materials, mods.material) : null;
    let colorPrefix = color?.prefix;
    if (mods?.color && COLOR_EMIT_OVERRIDE[mods.color]?.[mode]) {
      colorPrefix = COLOR_EMIT_OVERRIDE[mods.color][mode];
    }
    const prefixes = [condition?.prefix, colorPrefix, pattern?.prefix, material?.prefix].filter(Boolean);

    if (mode === "tag") {
      const itemTag = item.item_tag || "";
      if (!prefixes.length) return itemTag;
      const slug = (s) => s.replace(/\s+/g, "_");
      return [...prefixes.map(slug), itemTag].join("_");
    }
    // natlang
    const base = (item.display_name || item.item_tag || "").toLowerCase();
    const phrase = [...prefixes, base].join(" ");
    return mods?.focus ? `${phrase}, presenting ${phrase} to viewer, ${phrase} focus` : phrase;
  }

  // Tokenize a customized tag-mode token by walking suffixes against
  // tagToItem. Returns { item, modifiers } when the prefix peels validate
  // against the chip's group vocabulary, else null.
  async function peelTagModifiers(token) {
    const segments = token.split("_").filter(Boolean);
    if (segments.length < 2) return null;
    for (let i = 1; i < segments.length; i++) {
      const candidate = segments.slice(i).join("_");
      const lookup = tagToItem.get(candidate);
      if (!lookup) continue;
      if (!isCustomizableClothing("clothing", lookup.group)) continue;
      const data = await loadClothingMods(lookup.group);
      const peeled = segments.slice(0, i);
      const mods = matchModifierTokens(peeled, data);
      if (!mods) continue;
      return { lookup, modifiers: mods };
    }
    return null;
  }

  // Validate a list of tokens against the modifier vocab, mapping each
  // token to its category's tag. Returns null if any token isn't a known
  // modifier (so the caller treats the original chunk as freeform rather
  // than binding a half-recognized chip).
  function matchModifierTokens(tokens, data) {
    if (!tokens.length) return null;
    const out = { color: null, pattern: null, material: null, condition: null, focus: false };
    const buckets = [
      ["color", data.colors],
      ["pattern", data.patterns],
      ["material", data.materials],
      ["condition", data.conditions],
    ];
    for (const tok of tokens) {
      const norm = tok.toLowerCase().replace(/_/g, " ");
      let placed = false;
      // Per-color input override: e.g. "see-through" / "transparent" both
      // peel back to color="nude". Keyed by the post-normalize spelling.
      if (!out.color && COLOR_INPUT_OVERRIDE[norm]) {
        out.color = COLOR_INPUT_OVERRIDE[norm];
        placed = true;
      }
      if (!placed) {
        for (const [field, list] of buckets) {
          if (out[field]) continue;
          // Match against `prefix` first (what gets emitted) then `tag`.
          const opt = (list || []).find(o => (o.prefix || "").toLowerCase() === norm)
                   || (list || []).find(o => (o.tag || "").toLowerCase() === norm);
          if (opt) {
            out[field] = opt.tag;
            placed = true;
            break;
          }
        }
      }
      if (!placed) return null;
    }
    return out;
  }

  // Natlang prefix-peel: phrase like "burgundy torn silk cropped sweater".
  // For each chip whose display.toLowerCase() is a suffix of the phrase,
  // try peeling the leading words against the modifier vocab. Returns
  // { lookup, modifiers } on success.
  // Round-trip parser for prop interactions like "leaning against a school
  // desk", "sitting on a red velvet chaise lounge", "wielding a steel
  // sword", "holding an apple". Peels the prop_action verb prefix, then
  // the prop display name (longest suffix), then any modifier-prefix words
  // (color/pattern/material) off the head. Each verb is also gated by
  // prop_actions.compatible_categories — so "sitting on a sword" doesn't
  // match (sitting_on isn't compatible with weapons).
  // Returns a chip ready to drop into subj.slots.furniture, with assembled
  // base_tags/base_natlang that mirror /promptchain/props/assemble and
  // `_furniture` metadata so re-opening the customizer prefills cleanly.
  function matchFurnitureInteraction(phrase) {
    const furn = bucketCache.furniture;
    if (!furn?.loaded || !furn.mods || !furnitureActions?.length) return null;
    // Normalize underscores→spaces so both tag-form ("sitting_on red velvet
    // couch") and natlang ("sitting on a red velvet couch") emit shapes
    // compare cleanly. tag_format=spaces already converts on emit, but
    // underscore models keep them.
    const norm = (s) => (s || "").toLowerCase().replace(/_/g, " ").trim();
    const lower = norm(phrase);
    if (!lower) return null;

    // Each action contributes candidate prefixes from BOTH its natlang
    // ("sitting on a") and tag ("sitting_on") form — tag mode emits the tag
    // prefix, natlang mode the prose one. Longest-first so "leaning against"
    // wins over a shorter prefix.
    const verbs = [];
    for (const a of furnitureActions) {
      for (const p of [norm(a.action_prefix_natlang), norm(a.action_prefix_tags)]) {
        if (p) verbs.push({ action: a, prefix: p });
      }
    }
    verbs.sort((x, y) => y.prefix.length - x.prefix.length);

    for (const { action, prefix } of verbs) {
      if (!lower.startsWith(prefix + " ")) continue;
      const body = lower.slice(prefix.length + 1).trim();
      if (!body) continue;

      const compat = Array.isArray(action.compatible_categories) ? action.compatible_categories : [];

      // Suffix-match against each prop in this verb's compatible_categories,
      // trying tag + natlang + display forms so it works in either mode.
      const candidates = [];
      for (const it of furn.items) {
        if (compat.length && !compat.includes(it.item_group)) continue;
        for (const form of [norm(it.base_natlang), norm(it.base_tags), norm(it.display_name), norm(it.item_tag)]) {
          if (!form) continue;
          if (body === form || body.endsWith(" " + form)) { candidates.push({ it, nat: form }); break; }
        }
      }
      if (!candidates.length) continue;
      candidates.sort((a, b) => b.nat.length - a.nat.length);

      for (const { it, nat } of candidates) {
        const head = body.length === nat.length
          ? ""
          : body.slice(0, body.length - nat.length).trim();
        const mods = peelFurnitureMods(head, it);
        if (mods === null) continue;
        return buildFurnitureChip(it, action, mods);
      }
    }
    return null;
  }

  // Greedy longest-prefix peel of modifier words off `head` against the
  // furniture vocab. Returns null if any leftover word isn't a known
  // material/pattern/color prefix — so a phrase like "comfortable chair"
  // fails out instead of half-binding. A leading article ("a"/"an"/"the")
  // is stripped first since natlang emit doesn't include articles in the
  // assembled string but human prose / model output usually does.
  // Non-customizable props (food, weapons, etc.) skip the mod vocab
  // entirely — if any head words remain after stripping the article, that
  // means the phrase had decoration we can't bind, so reject.
  function peelFurnitureMods(head, propItem) {
    let h = (head || "").trim().replace(/_/g, " ").replace(/^(?:an?|the)\s+/, "");
    if (!h) return { color: null, pattern: null, material: null };
    if (propItem && propItem.is_customizable === false) return null;
    const data = bucketCache.furniture?.mods;
    if (!data) return null;
    const out = { color: null, pattern: null, material: null };
    const buckets = [
      ["color", data.colors],
      ["pattern", data.patterns],
      ["material", data.materials],
    ];
    let remaining = h;
    while (remaining) {
      let bestLen = 0;
      let bestField = null;
      let bestTag = null;
      for (const [field, list] of buckets) {
        if (out[field]) continue;
        for (const opt of (list || [])) {
          // Match either the natlang prefix or the tag form (both
          // normalized to spaces) so tag- and natlang-mode emits both peel.
          for (const cand of [(opt.prefix || "").toLowerCase(), (opt.tag || "").toLowerCase().replace(/_/g, " ")]) {
            if (!cand) continue;
            if ((remaining === cand || remaining.startsWith(cand + " ")) && cand.length > bestLen) {
              bestLen = cand.length;
              bestField = field;
              bestTag = opt.tag;
            }
          }
        }
      }
      if (!bestField) return null;
      out[bestField] = bestTag;
      remaining = remaining.slice(bestLen).trim();
    }
    return out;
  }

  // Reconstruct a furniture chip from a matched (prop, action, mods) tuple.
  // Mirrors core/tag_builder.py /promptchain/props/assemble so emit and
  // round-trip stay consistent: tag-form is space-joined prefixes + prop
  // tag (with action_prefix_tags prepended); natlang is space-joined
  // prefixes + base_natlang (with action_prefix_natlang prepended).
  function buildFurnitureChip(propItem, action, mods) {
    const data = bucketCache.furniture.mods;
    const colorRow    = mods.color    ? (data.colors    || []).find(c => c.tag === mods.color)    : null;
    const patternRow  = mods.pattern  ? (data.patterns  || []).find(p => p.tag === mods.pattern)  : null;
    const materialRow = mods.material ? (data.materials || []).find(m => m.tag === mods.material) : null;

    const tagParts = [];
    const nlParts = [];
    if (colorRow)    { tagParts.push(colorRow.tag);    nlParts.push(colorRow.prefix); }
    if (patternRow)  { tagParts.push(patternRow.tag);  nlParts.push(patternRow.prefix); }
    if (materialRow) { tagParts.push(materialRow.tag); nlParts.push(materialRow.prefix); }
    tagParts.push(propItem.item_tag);
    nlParts.push(propItem.base_natlang || (propItem.display_name || "").toLowerCase());

    let baseTags = tagParts.join(" ");
    let baseNatlang = nlParts.join(" ");
    if (action) {
      baseTags = `${action.action_prefix_tags} ${baseTags}`;
      baseNatlang = `${action.action_prefix_natlang} ${baseNatlang}`;
    }

    const labelParts = [];
    if (action?.display_name)  labelParts.push(action.display_name);
    if (colorRow?.display)     labelParts.push(colorRow.display);
    if (patternRow?.display)   labelParts.push(patternRow.display);
    if (materialRow?.display)  labelParts.push(materialRow.display);
    labelParts.push(propItem.display_name);

    const syntheticTag =
      `_furn_${propItem.item_tag}_${action?.action_tag || "x"}_${mods.color || "x"}_${mods.material || "x"}_${mods.pattern || "x"}`;

    return {
      group: propItem.item_group,
      chip: {
        item_tag: syntheticTag,
        display_name: labelParts.join(" "),
        item_group: propItem.item_group,
        base_tags: baseTags,
        base_natlang: baseNatlang,
        natlang_status: "normalized",
        _furniture: {
          prop_tag: propItem.item_tag,
          prop_display: propItem.display_name,
          material: mods.material || null,
          pattern: mods.pattern || null,
          color: mods.color || null,
          action: action?.action_tag || null,
        },
      },
    };
  }

  async function peelNatlangModifiers(phrase) {
    const lower = phrase.toLowerCase().trim();
    // Collect candidate chips: anything whose display ends the phrase.
    const candidates = [];
    for (const [bucket, data] of Object.entries(bucketCache)) {
      if (bucket !== "clothing") continue;
      for (const it of (data.items || [])) {
        if (!isCustomizableClothing("clothing", it.item_group)) continue;
        const display = (it.display_name || it.item_tag || "").toLowerCase();
        if (!display) continue;
        if (lower === display || lower.endsWith(" " + display)) {
          candidates.push({ it, display });
        }
      }
    }
    // Prefer the longest display match so ambiguous suffixes resolve to the
    // most specific chip first.
    candidates.sort((a, b) => b.display.length - a.display.length);
    for (const { it, display } of candidates) {
      let head = lower.length === display.length
        ? ""
        : lower.slice(0, lower.length - display.length).trim();
      // Strip a leading "wearing" / "wearing a" / "wearing an" — common
      // prose prefix the model emits but our modifier vocab doesn't carry.
      head = head.replace(/^wearing(?:\s+an?)?\s*/, "").trim();
      const data = await loadClothingMods(it.item_group);
      // Walk longest-prefix match for each modifier word group. To support
      // multi-word prefixes ("polka dot"), greedily try the longest match
      // remaining at each step.
      const mods = matchNatlangPrefix(head, data);
      if (!mods) continue;
      return {
        lookup: { bucket: "clothing", group: it.item_group, item: it },
        modifiers: mods,
      };
    }
    return null;
  }

  // Greedy longest-match of head words against the modifier vocab's
  // `prefix` field. Returns null if the head can't be fully consumed.
  function matchNatlangPrefix(head, data) {
    if (!head) return { color: null, pattern: null, material: null, condition: null, focus: false };
    const buckets = [
      ["color", data.colors],
      ["pattern", data.patterns],
      ["material", data.materials],
      ["condition", data.conditions],
    ];
    const out = { color: null, pattern: null, material: null, condition: null, focus: false };
    let remaining = head;
    while (remaining) {
      let consumed = false;
      // Try each bucket; for each, try its longest unmatched prefix.
      let bestLen = 0;
      let bestField = null;
      let bestTag = null;
      // Per-color input override aliases (e.g. "transparent" → nude).
      if (!out.color) {
        for (const [alias, canonicalTag] of Object.entries(COLOR_INPUT_OVERRIDE)) {
          if (remaining === alias || remaining.startsWith(alias + " ")) {
            if (alias.length > bestLen) {
              bestLen = alias.length;
              bestField = "color";
              bestTag = canonicalTag;
            }
          }
        }
      }
      for (const [field, list] of buckets) {
        if (out[field]) continue;
        for (const opt of (list || [])) {
          const p = (opt.prefix || "").toLowerCase();
          if (!p) continue;
          if (remaining === p || remaining.startsWith(p + " ")) {
            if (p.length > bestLen) {
              bestLen = p.length;
              bestField = field;
              bestTag = opt.tag;
            }
          }
        }
      }
      if (bestField) {
        out[bestField] = bestTag;
        remaining = remaining.slice(bestLen).trim();
        consumed = true;
      }
      if (!consumed) return null;
    }
    return out;
  }

  // ----------------------------------------------------------------------
  //  COMPOSER
  // ----------------------------------------------------------------------

  function itemText(item) {
    return isNaturalMode
      ? (item.base_natlang || item.display_name || item.item_tag)
      : (item.base_tags || item.item_tag);
  }

  // Resolve a chip's text honoring the per-category override hierarchy
  // when in natlang mode. Tag mode bypasses overrides (model handles
  // contextual rendering via training association on tag order).
  // Override key fallback: some chip rows have prefixed item_tags
  // (e.g. `headwear_garrison_cap`) while overrides + outfit_tags use the
  // bare canonical token (`garrison_cap`). Try base_tags as the key when
  // it's a single token.
  // Modifier customization (color/pattern/material/condition/focus from the
  // clothing customizer) takes precedence over base_natlang but yields to
  // an outfit/character override — overrides are deliberate per-context
  // text and shouldn't be clobbered by user modifier picks.
  function chipText(item, overrides) {
    if (isNaturalMode) {
      if (overrides) {
        if (overrides[item.item_tag]) return overrides[item.item_tag];
        const bt = (item.base_tags || "").trim();
        if (bt && !bt.includes(",") && !bt.startsWith("(") && overrides[bt]) {
          return overrides[bt];
        }
      }
      if (item.modifiers) {
        const phrase = item.item_group === "fantasy"
          ? buildFantasyPhrase(item, item.modifiers, "natlang")
          : buildModifiedPhrase(item, item.modifiers, "natlang");
        if (phrase) return phrase;
      }
      return item.base_natlang || item.display_name || item.item_tag;
    }
    if (item.modifiers) {
      const phrase = item.item_group === "fantasy"
        ? buildFantasyPhrase(item, item.modifiers, "tag")
        : buildModifiedPhrase(item, item.modifiers, "tag");
      if (phrase) return phrase;
    }
    return item.base_tags || item.item_tag;
  }

  // Iterate slots in canonical bucket-group order. `subj` (when provided)
  // routes per-category override lookups: appearance → character.overrides,
  // clothing → activeOutfit.overrides, pose → activePose.overrides.
  //
  // Appearance delta: activeOutfit and activePose can each carry
  // appearance_adds / appearance_removes (JSON arrays of appearance chip
  // tags). Removes suppress matching items from the bound appearance set
  // for this render; adds inject chips that aren't bound. SF6 Cammy adds
  // short_hair and removes twin_braids+long_hair, for example. Slots
  // themselves stay intact so removing the outfit reverts to baseline.
  function iterateSlots(slots, subj) {
    const bits = [];
    const appearanceRemoves = new Set();
    const appearanceAdds = new Set();
    if (subj?.activeOutfit) {
      for (const t of subj.activeOutfit.appearance_removes || []) appearanceRemoves.add(t);
      for (const t of subj.activeOutfit.appearance_adds || []) appearanceAdds.add(t);
    }
    if (subj?.activePose) {
      for (const t of subj.activePose.appearance_removes || []) appearanceRemoves.add(t);
      for (const t of subj.activePose.appearance_adds || []) appearanceAdds.add(t);
    }
    for (const catKey of Object.keys(slots || {})) {
      let overrides = null;
      if (subj) {
        if (catKey === "appearance") overrides = subj.character?.overrides;
        else if (catKey === "clothing") overrides = subj.activeOutfit?.overrides;
        else if (catKey === "pose") overrides = subj.activePose?.overrides;
      }
      const bucket = CATEGORIES.find(c => c.key === catKey)?.bucket;
      const groupOrder = bucketCache[bucket]?.groups?.map(g => g.group_name) || Object.keys(slots[catKey]);
      const emittedAppearance = new Set();
      for (const grp of groupOrder) {
        const arr = slots[catKey][grp] || [];
        for (const it of arr) {
          if (catKey === "appearance" && appearanceRemoves.has(it.item_tag)) continue;
          const t = chipText(it, overrides);
          if (t?.trim()) bits.push(t.trim());
          if (catKey === "appearance") emittedAppearance.add(it.item_tag);
        }
      }
      if (catKey === "appearance" && appearanceAdds.size) {
        for (const addTag of appearanceAdds) {
          if (emittedAppearance.has(addTag) || appearanceRemoves.has(addTag)) continue;
          const lookup = tagToItem.get(addTag);
          if (!lookup || lookup.bucket !== "appearance") continue;
          const t = chipText(lookup.item, overrides);
          if (t?.trim()) bits.push(t.trim());
        }
      }
    }
    return bits;
  }

  // Subject body is identity + appearance only. Clothing and pose emit
  // as their own `// Outfit` / `// Pose` paragraphs whether or not a
  // preset is bound, so the right-panel section structure mirrors the
  // prompt structure 1:1. Subtracting the snapshot still happens so
  // preset chips don't double-up when ad-hoc chips landed in the same
  // slots.
  function composeSubjectBody(subj) {
    let s = subj;
    if (subj.outfitSnapshot) s = subtractSnapshot(s, subj.outfitSnapshot);
    if (subj.poseSnapshot) s = subtractSnapshot(s, subj.poseSnapshot);

    const typeDef = SUBJECT_TYPES[subj.type] || SUBJECT_TYPES.person;
    // clothing + pose + furniture each emit as their own trailing section
    // (// Outfit / // Pose / // Interaction). Excluding them here keeps the
    // base subject body to identity + appearance + expression + action.
    const skipCategories = new Set(["clothing", "pose", "furniture"]);
    const orderedSlots = {};
    for (const catKey of typeDef.slotCategories) {
      if (skipCategories.has(catKey)) continue;
      if (s.slots[catKey]) orderedSlots[catKey] = s.slots[catKey];
    }

    // Chip clauses (modifiers + slots + freeform) in the appropriate format.
    const chipBits = [];
    for (const tok of (s.modifiers || [])) {
      if (!tok.trim()) continue;
      chipBits.push(isNaturalMode ? (MODIFIER_NATLANG[tok] || tok) : tok);
    }
    chipBits.push(...iterateSlots(orderedSlots, subj));
    for (const tok of (s.freeform || [])) {
      if (tok.trim()) chipBits.push(tok.trim());
    }

    if (isNaturalMode) {
      // base_natlang leads. When chips follow, drop the prefix's trailing
      // period and use ", " so the identity + descriptors read as one
      // continuous clause — better for T5/Qwen text encoders, uniform
      // with the rest of the comma-joined chip stream, and consistent
      // with Flux/Qwen prompt-engineering conventions. When the subject
      // has no chips, keep the period so the standalone identity is a
      // complete sentence.
      if (subj.character) {
        const base = (subj.character.base_natlang || "").trim();
        if (!chipBits.length) return base;
        const baseNoPeriod = base.replace(/\.\s*$/, "");
        return baseNoPeriod ? `${baseNoPeriod}, ${chipBits.join(", ")}.` : `${chipBits.join(", ")}.`;
      }
      return chipBits.length ? `${chipBits.join(", ")}.` : "";
    }

    // Tag mode: identityTokens lead (e.g. (cammy_white:1.1)), then chips.
    const lead = (s.identityTokens || []).filter(t => t.trim());
    return [...lead, ...chipBits].join(", ");
  }

  function composeSnapshotBody(snapshot, marker, subj, kind) {
    if (!snapshot) return "";
    // Natlang fallback: only emit the preset's full prose blob when the
    // outfit/pose has NOT been decomposed into chip overrides. Curated
    // presets decompose chip-by-chip via the override lookup below so
    // user edits to slot chips flow through.
    const hasOverrides = marker?.overrides && Object.keys(marker.overrides).length > 0;
    if (isNaturalMode && !hasOverrides && marker?.natlang?.trim()) {
      return marker.natlang.trim();
    }
    // Per-chip override lookup uses the marker's overrides regardless of
    // category — the snapshot's chips all came from this preset, so this
    // marker's overrides are authoritative.
    const overrides = marker?.overrides || {};
    // The outfit section owns clothing; the pose section owns pose. When we
    // hit the primary category we iterate subj.slots so user-added chips
    // land here in panel order. Other categories the snapshot touches
    // (e.g. an outfit's body_marks override for a tattoo) emit only the
    // snapshot's chips, filtered to those still in slots.
    const primaryCat = kind === "outfit" ? "clothing" : kind === "pose" ? "pose" : null;
    const categoriesToEmit = new Set(Object.keys(snapshot.matched || {}));
    if (primaryCat) categoriesToEmit.add(primaryCat);

    const bits = [];
    for (const catKey of categoriesToEmit) {
      const bucket = CATEGORIES.find(c => c.key === catKey)?.bucket;
      if (catKey === primaryCat) {
        const slotMap = subj?.slots?.[catKey] || {};
        const groupOrder = bucketCache[bucket]?.groups?.map(g => g.group_name) || Object.keys(slotMap);
        for (const grp of groupOrder) {
          const arr = slotMap[grp] || [];
          for (const it of arr) {
            const t = chipText(it, overrides);
            if (t?.trim()) bits.push(t.trim());
          }
        }
      } else {
        const matchedGroups = snapshot.matched[catKey] || {};
        const groupOrder = bucketCache[bucket]?.groups?.map(g => g.group_name) || Object.keys(matchedGroups);
        for (const grp of groupOrder) {
          const arr = matchedGroups[grp] || [];
          for (const it of arr) {
            // Snapshot is the original preset; if the user removed this
            // chip from slots, don't re-emit it.
            if (subj && !subj.slots?.[catKey]?.[grp]?.some(x => x.item_tag === it.item_tag)) continue;
            const t = chipText(it, overrides);
            if (t?.trim()) bits.push(t.trim());
          }
        }
      }
    }
    for (const tok of (snapshot.freeform || [])) if (tok.trim()) bits.push(tok.trim());
    // Section-anchored freeform — phrases the parser couldn't bind to a
    // chip in this section but knew came from it. Emit after bound chips
    // so user-edited prose stays inside the section it was authored in.
    const sectionKey = kind === "outfit" ? "outfit" : kind === "pose" ? "pose" : null;
    if (sectionKey) {
      for (const tok of (subj?.sectionFreeform?.[sectionKey] || [])) {
        if (tok.trim()) bits.push(tok.trim());
      }
    }
    const body = bits.join(", ");
    // Terminate snapshot bodies with a period in natlang mode so the next
    // section's first phrase doesn't glue to this section's last chip when
    // the prompt round-trips through positiveContentLines.join(" "). Without
    // this, "small gold hoop earrings\n\n// Interaction\nleaning on…" parses
    // back as one merged chunk that lands in freeform.
    return isNaturalMode && body ? `${body}.` : body;
  }

  function defaultCharacterCommentHeader(option) {
    if (!option) return null;
    if (option.kind === "cast") return `// Subject: ${option.display || option.tag}`;
    const series = option.series ? ` (${option.series})` : "";
    return `// Character: ${option.display || option.tag}${series}`;
  }

  // Compose the body of an ad-hoc category section (no preset bound).
  // Iterates that category's slots in group order, emits chip text, and
  // wraps in a natlang intro phrase if provided (e.g. "Wearing"). Empty
  // categories return "" so the caller can skip the section entirely.
  function composeCategoryBody(subj, catKey, intro) {
    const bucket = CATEGORIES.find(c => c.key === catKey)?.bucket;
    const slotMap = subj.slots[catKey] || {};
    const groupOrder = bucketCache[bucket]?.groups?.map(g => g.group_name) || Object.keys(slotMap);
    const bits = [];
    for (const grp of groupOrder) {
      const arr = slotMap[grp] || [];
      for (const it of arr) {
        const t = chipText(it, null);
        if (t?.trim()) bits.push(t.trim());
      }
    }
    // Map category key → section freeform bucket. clothing → outfit because
    // both ad-hoc clothing and outfit-preset clothing emit inside the
    // `// Outfit` section, where the parser's section attribution stamps
    // unmatched chunks.
    const sectionKey =
      catKey === "clothing"  ? "outfit" :
      catKey === "pose"      ? "pose" :
      catKey === "furniture" ? "interaction" :
      null;
    if (sectionKey) {
      for (const tok of (subj?.sectionFreeform?.[sectionKey] || [])) {
        if (tok.trim()) bits.push(tok.trim());
      }
    }
    if (!bits.length) return "";
    if (!isNaturalMode) return bits.join(", ");
    if (intro) {
      const first = bits[0];
      const article = /^[aeiou]/i.test(first) ? "an" : "a";
      return `${intro} ${article} ${bits.join(", ")}.`;
    }
    return `${bits.join(", ")}.`;
  }

  function subjectHeader(subj) {
    // commentHeader explicitly null means "user deleted the comment;
    // don't re-inject". A set string means "use this verbatim". Only
    // the no-character blank-subject fallback auto-generates a label.
    if (subj.character) {
      return subj.character.commentHeader ?? null;
    }
    if (subj.commentHeader !== undefined) return subj.commentHeader;
    return `// ${subj.name || `Subject ${subj.letter}`}`;
  }

  function composeOutput() {
    const parts = [];

    // Both tag + natlang modes use the same v1-style sectioned output;
    // body content is mode-aware via itemText / base_natlang inside the
    // composers.
    // Region numbering for subjects the user added (no regionName): continue
    // past the highest existing $mannequinN so fresh blocks don't collide.
    const usedRegionNums = new Set();
    for (const s of subjects) {
      const m = /(\d+)$/.exec(s.regionName || "");
      if (m) usedRegionNums.add(parseInt(m[1], 10));
    }
    let nextRegionNum = 0;
    const freshRegionName = () => {
      do { nextRegionNum++; } while (usedRegionNums.has(nextRegionNum));
      usedRegionNums.add(nextRegionNum);
      return `$mannequin${nextRegionNum}`;
    };

    for (const subj of subjects) {
      // Collect this subject's sections, then emit flat or — in region mode —
      // wrapped in its `$name { }` regional block.
      const subjParts = [];
      const body = composeSubjectBody(subj);
      if (body) {
        const h = subjectHeader(subj);
        subjParts.push(h ? `${h}\n${body}` : body);
      }

      if (subj.activeOutfit && subj.outfitSnapshot) {
        const outfitBody = composeSnapshotBody(subj.outfitSnapshot, subj.activeOutfit, subj, "outfit");
        if (outfitBody) {
          const oa = subj.activeOutfit;
          const subjLabel = subj.character?.display || subj.name || `Subject ${subj.letter}`;
          const isCross = subj.character?.tag && oa.character_tag !== subj.character.tag;
          const fromBit = isCross && oa.character_display ? ` from Character: ${oa.character_display}` : "";
          subjParts.push(`// Outfit: ${oa.name}${fromBit} (${subjLabel})\n${outfitBody}`);
        }
      } else {
        const adhocOutfit = composeCategoryBody(subj, "clothing", isNaturalMode ? "Wearing" : null);
        if (adhocOutfit) subjParts.push(`// Outfit\n${adhocOutfit}`);
      }

      if (subj.activePose && subj.poseSnapshot) {
        const poseBody = composeSnapshotBody(subj.poseSnapshot, subj.activePose, subj, "pose");
        if (poseBody) {
          const pa = subj.activePose;
          const subjLabel = subj.character?.display || subj.name || `Subject ${subj.letter}`;
          const isCross = subj.character?.tag && pa.character_tag !== subj.character.tag;
          const fromBit = isCross && pa.character_display ? ` from Character: ${pa.character_display}` : "";
          subjParts.push(`// Pose: ${pa.name}${fromBit} (${subjLabel})\n${poseBody}`);
        }
      } else {
        const adhocPose = composeCategoryBody(subj, "pose", null);
        if (adhocPose) subjParts.push(`// Pose\n${adhocPose}`);
      }

      // Furniture interactions emit last for the subject. Chip text already
      // includes the verb prefix ("sitting on a red velvet chaise lounge"),
      // so no natlang intro phrase — composeCategoryBody with intro=null
      // just joins the chips and adds a trailing period in natlang mode.
      const interactions = composeCategoryBody(subj, "furniture", null);
      if (interactions) subjParts.push(`// Interaction\n${interactions}`);

      if (!subjParts.length) continue;
      if (regionMode) {
        const region = subj.regionName || freshRegionName();
        const inner = subjParts.join("\n\n")
          .split("\n")
          .map(l => (l.trim() ? `  ${l}` : l))
          .join("\n");
        parts.push(`${region} {\n${inner}\n}`);
      } else {
        parts.push(...subjParts);
      }
    }

    const sceneBucket = bucketCache.scene;
    const sceneGroupOrder = sceneBucket?.groups?.map(g => g.group_name) || [];
    // Furniture sub-categories live alongside scene groups inside
    // sceneSelections — append them so they emit in the Scene section too.
    const furnitureGroupOrder = bucketCache.furniture?.groups?.map(g => g.group_name) || [];
    const sceneOrder = [...sceneGroupOrder, ...furnitureGroupOrder];
    const seenKeys = new Set(sceneOrder);
    // Any sceneSelections key not yet covered (e.g. furniture loaded after a
    // round-trip parse, or unfamiliar legacy keys) still emits — order is
    // not guaranteed but the content isn't dropped.
    for (const k of Object.keys(sceneSelections)) if (!seenKeys.has(k)) sceneOrder.push(k);
    const sceneBits = [];
    for (const grp of sceneOrder) {
      for (const it of (sceneSelections[grp] || [])) {
        const t = itemText(it);
        if (t?.trim()) sceneBits.push(t.trim());
      }
    }
    // Section-anchored scene freeform — phrases the parser saw under
    // `// Scene` but couldn't bind to a chip. Append so user-authored
    // scene prose survives round-trips inside the same section.
    for (const subj of subjects) {
      for (const tok of (subj.sectionFreeform?.scene || [])) {
        if (tok.trim()) sceneBits.push(tok.trim());
      }
    }
    // Global scene freeform — scene-section phrases from a subjectless edit
    // that have no subject to carry them.
    for (const tok of sceneFreeform) {
      if (tok.trim()) sceneBits.push(tok.trim());
    }
    if (sceneBits.length) parts.push(`// Scene\n${sceneBits.join(", ")}`);

    if (activeStyle?.tags?.length) {
      // Emit the user's original header if round-trip captured one;
      // otherwise no header — preserves "comment was deleted" intent.
      // First-time picks set commentHeader = "// Style: <name>".
      if (activeStyle.commentHeader) {
        parts.push(`${activeStyle.commentHeader}\n${activeStyle.tags.join(", ")}`);
      } else {
        parts.push(activeStyle.tags.join(", "));
      }
      // The style's negative rides as its own trailing block. It's owned by
      // the style (pick sets it from the preset; round-trip moves it here off
      // passthrough), so this is the single source — no duplicate elsewhere.
      if (activeStyle.negative) {
        parts.push(`Negative Prompt:\n${activeStyle.negative}`);
      }
    }

    let out = parts.join("\n\n");
    // Preserve comments + blank lines we couldn't parse as managed
    // content. Position-aware interleaving is a follow-up; for now they
    // append to the end of the output. Strip orphan section headers
    // (`// Outfit`, `// Pose`, `// Character: …`, `// Subject: …`,
    // `// Scene`, `// Style: …`) whose body is empty — those land in
    // passthrough when the user adds a second subject without filling it
    // or deletes the body of a managed section, and emitting them again
    // re-pollutes the output with stale headers.
    if (preservedPassthrough && preservedPassthrough.trim()) {
      const ORPHAN_HEADER_RE = /^\/\/\s*(Outfit|Pose|Scene|Style|Character|Subject|Interaction)(\s*:.*)?\s*$/;
      const lines = preservedPassthrough.split("\n");
      const kept = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (ORPHAN_HEADER_RE.test(line)) {
          // Skip if the next non-blank line is another comment line (any
          // `// ...`, not just known headers) or end of input — the header
          // has no tag body to introduce, so compose's re-emit would
          // duplicate it. A custom comment like "// 3D Style" between two
          // managed headers must still count as a boundary here.
          let j = i + 1;
          while (j < lines.length && lines[j].trim() === "") j++;
          if (j >= lines.length || /^\s*\/\//.test(lines[j])) continue;
        }
        kept.push(line);
      }
      const filtered = kept.join("\n").trim();
      if (filtered) out = out ? `${out}\n\n${filtered}` : filtered;
    }
    // Tag mode honors the model's tag_format: convert underscores to spaces
    // per tag token when the model expects spaces. Headers (// ...) and
    // natlang prose are left untouched.
    if (!isNaturalMode && tagSourceConfig?.format === "spaces") {
      out = out
        .split("\n")
        .map(line => (line.startsWith("//") ? line : formatTagsForModel(line, tagSourceConfig)))
        .join("\n");
    }
    return out;
  }

  function handleInsert() {
    onInsert(composeOutput());
  }

  function setMode(natural) {
    isNaturalMode = natural;
    onPromptStyleChange(natural ? "natural" : "tags");
  }
</script>

<div class="pcr-atb-panel pcr-atb2" class:pcr-atb-maximized={maximized}>
  <div class="pcr-atb-header">
    <span class="pcr-atb-title">Tag Builder 2</span>
    <div class="pcr-atb-search-wrapper">
      <input
        class="pcr-atb-search"
        type="text"
        placeholder={searchPlaceholder}
        bind:value={searchQuery}
      />
    </div>
    <button
      class="pcr-atb2-titlebar-btn"
      onclick={toggleMaximized}
      aria-label={maximized ? "Restore" : "Maximize"}
      title={maximized ? "Restore" : "Maximize"}
    >{maximized ? "❐" : "▢"}</button>
    <button class="pcr-atb2-close" onclick={onClose} aria-label="Close">&times;</button>
  </div>

  <div class="pcr-atb2-body">
    <!-- LEFT RAIL -->
    <aside class="pcr-atb2-rail" bind:this={railEl}>
      <div class="pcr-atb2-rail-heading">Categories</div>
      {#each effectiveCategories as cat}
        {@const isActive = activeCategory === cat.key}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="pcr-atb2-rail-item"
          class:active={isActive}
          class:disabled={!cat.enabled}
          onclick={() => selectCategory(cat.key)}
        >
          <span class="pcr-atb2-rail-icon">{cat.icon}</span>
          <span class="pcr-atb2-rail-label">{cat.label}</span>
          {#if cat.enabled && cat.key === "subjects"}
            <!-- count is per-subitem; parent shows none -->
          {:else if cat.key === "styles"}
            {#if cat.enabled && stylesCache.items.length}
              <span class="pcr-atb2-rail-count">{stylesCache.items.length}</span>
            {/if}
          {:else if cat.enabled && bucketCache[cat.bucket]?.items}
            <span class="pcr-atb2-rail-count">{bucketCache[cat.bucket].items.length}</span>
          {/if}
        </div>

        {#if isActive && cat.key === "subjects"}
          <div class="pcr-atb2-rail-drilldown">
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="pcr-atb2-rail-sub"
              class:active={activeSubjectSubitem === null}
              onclick={() => activeSubjectSubitem = null}
            >
              <span class="pcr-atb2-rail-sub-label">All</span>
              {#if charactersTotal > 0 && !activeSubjectSubitem}
                <span class="pcr-atb2-rail-count">{charactersTotal.toLocaleString()}</span>
              {/if}
            </div>
            {#each SUBJECT_SUBITEMS as sub}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="pcr-atb2-rail-sub"
                class:active={activeSubjectSubitem === sub.key}
                onclick={() => selectSubjectSubitem(sub.key)}
              >
                <span class="pcr-atb2-rail-sub-label">{sub.label}</span>
                {#if sub.source === "cast" && castCache[sub.filter]?.items}
                  <span class="pcr-atb2-rail-count">{castCache[sub.filter].items.length}</span>
                {:else if sub.source === "characters" && characterCategoryCounts[sub.filter]}
                  <span class="pcr-atb2-rail-count">{characterCategoryCounts[sub.filter]}</span>
                {/if}
              </div>
            {/each}
          </div>
        {:else if isActive && cat.key === "styles" && styleGroups.length}
          <div class="pcr-atb2-rail-drilldown">
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="pcr-atb2-rail-sub"
              class:active={activeGroup === null}
              onclick={() => activeGroup = null}
            >
              <span class="pcr-atb2-rail-sub-label">All</span>
              <span class="pcr-atb2-rail-count">{stylesCache.items.length}</span>
            </div>
            {#each styleGroups as g}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="pcr-atb2-rail-sub"
                class:active={activeGroup === g.group_name}
                onclick={() => selectGroup(g.group_name)}
              >
                <span class="pcr-atb2-rail-sub-label">{g.display_name}</span>
                <span class="pcr-atb2-rail-count">{(itemsByGroup[g.group_name] || []).length}</span>
              </div>
            {/each}
          </div>
        {:else if isActive && cat.enabled && bucketCache[cat.bucket]?.groups?.length}
          <div class="pcr-atb2-rail-drilldown">
            {#each bucketCache[cat.bucket].groups as g}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="pcr-atb2-rail-sub"
                class:active={activeGroup === null && scrollSpyGroup === g.group_name}
                onclick={() => scrollToGroup(g.group_name)}
              >
                <span class="pcr-atb2-rail-sub-label">{g.display_name || g.group_name}</span>
                <span class="pcr-atb2-rail-count">{(itemsByGroup[g.group_name] || []).length}</span>
              </div>
            {/each}
            {#if cat.key === "appearance"}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="pcr-atb2-rail-sub"
                class:active={activeGroup === MODIFIER_GROUP_KEY}
                onclick={() => selectGroup(MODIFIER_GROUP_KEY)}
              >
                <span class="pcr-atb2-rail-sub-label">Modifiers</span>
                <span class="pcr-atb2-rail-count">{MODIFIER_ITEMS.length}</span>
              </div>
            {/if}
          </div>
        {:else if activeCategory === "all" && cat.key === scrollSpyCategory && cat.enabled && cat.bucket && bucketCache[cat.bucket]?.groups?.length}
          <!-- All-view accordion: auto-expand whichever category the scroll
               spy is currently in, highlighting the section at the top. -->
          <div class="pcr-atb2-rail-drilldown">
            {#each bucketCache[cat.bucket].groups as g}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="pcr-atb2-rail-sub"
                class:active={scrollSpyGroup === cat.key + "/" + g.group_name}
                onclick={() => scrollToAllSection(cat.key + "/" + g.group_name)}
              >
                <span class="pcr-atb2-rail-sub-label">{g.display_name || g.group_name}</span>
                <span class="pcr-atb2-rail-count">{bucketCache[cat.bucket].items.filter(i => i.item_group === g.group_name).length}</span>
              </div>
            {/each}
            {#if cat.key === "appearance"}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="pcr-atb2-rail-sub"
                class:active={scrollSpyGroup === "appearance/__modifiers__"}
                onclick={() => scrollToAllSection("appearance/__modifiers__")}
              >
                <span class="pcr-atb2-rail-sub-label">Modifiers</span>
                <span class="pcr-atb2-rail-count">{MODIFIER_ITEMS.length}</span>
              </div>
            {/if}
          </div>
        {/if}
      {/each}
    </aside>

    <!-- MIDDLE: BROWSER -->
    <main
      class="pcr-atb2-browser"
      class:pcr-atb2-list-mode={viewMode === "list"}
      style="--pcr-atb2-card-min: {cardMinPx}px"
      bind:this={browserEl}
    >
      <div class="pcr-atb2-browser-header">
        <span class="pcr-atb2-breadcrumb">
          <span class="pcr-atb2-bc-target" class:rebind={routingTarget.type === "rebind"}>
            Adding to: <strong>{routingTarget.label}</strong>
          </span>
          {#if activeGroup}
            <span class="pcr-atb2-bc-sep">/</span>
            <span class="pcr-atb2-bc-group">{groupDisplay(activeBucket, activeGroup)}</span>
          {/if}
        </span>
        <div class="pcr-atb2-view-toggle" role="radiogroup" aria-label="View mode">
          <button class="pcr-atb2-view-btn" class:active={viewMode === "cards"} role="radio" aria-checked={viewMode === "cards"} title="Card view" onclick={() => setViewMode("cards")}>▦</button>
          <button class="pcr-atb2-view-btn" class:active={viewMode === "list"} role="radio" aria-checked={viewMode === "list"} title="List view" onclick={() => setViewMode("list")}>☰</button>
        </div>
      </div>

      {#if activeCategory === "all"}
        {#snippet recentCard(r)}
          {#if r.type === "identity"}
            {@const o = r.option}
            {@const isChar = o.kind === "character"}
            {@const rHasImg = isChar ? characterThumbs.has(o.tag) : !!castThumbs[o.group]?.has(o.tag)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="pcr-atb2-card" title={o.base_natlang || o.display || o.tag} onclick={() => pickIdentityFromBrowser(o)}>
              <div class="pcr-atb2-card-thumb" class:has-image={rHasImg}>
                {#if rHasImg}
                  <img src={isChar
                    ? `/promptchain/tag-builder/thumb/characters/${encodeURIComponent(o.tag)}`
                    : `/promptchain/tag-builder/thumb/${encodeURIComponent(o.group)}/${encodeURIComponent(o.tag)}`} alt="" loading="lazy" />
                {/if}
              </div>
              <div class="pcr-atb2-card-name">{o.display || o.tag}</div>
              {#if o.series}<div class="pcr-atb2-card-group">{o.series}</div>{/if}
            </div>
          {:else}
            {@const it = r.item}
            {@const rBucket = CATEGORIES.find(c => c.key === r.categoryKey)?.bucket}
            {@const rHasImg = !!rBucket && hasThumb(rBucket, it.item_tag)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="pcr-atb2-card" title={it.base_natlang || it.display_name || it.item_tag} onclick={() => pickItemFromAll(it, r.categoryKey, r.groupKey)}>
              <div class="pcr-atb2-card-thumb" class:has-image={rHasImg}>
                {#if rHasImg}<img src={thumbUrl(rBucket, it.item_tag)} alt="" loading="lazy" />{/if}
              </div>
              <div class="pcr-atb2-card-name">{it.display_name || it.item_tag}</div>
            </div>
          {/if}
        {/snippet}
        {#if RECENT_ENABLED && recentPicks.length > 0 && !searchQuery.trim()}
          <div class="pcr-atb2-browser-section pcr-atb2-recent-section">
            <div class="pcr-atb2-browser-section-header">
              <span class="pcr-atb2-browser-section-cat">🕘 Recently used</span>
              <button class="pcr-atb2-recent-clear" onclick={clearRecent} title="Clear recently used">clear</button>
            </div>
            <div class="pcr-atb2-grid">
              {#each recentPicks as r (recentKey(r))}
                {@render recentCard(r)}
              {/each}
            </div>
          </div>
        {/if}
        {#if allCategorySections.length === 0}
          <div class="pcr-atb2-empty">{searchQuery ? `No items match "${searchQuery}"` : "Loading…"}</div>
        {:else}
          {#each allCategorySections as section (section.key)}
            {@const cat = CATEGORIES.find(c => c.key === section.categoryKey)}
            <div class="pcr-atb2-browser-section" data-spy-group={section.key} use:spyTarget>
              <div class="pcr-atb2-section-sentinel"></div>
              <div class="pcr-atb2-browser-section-header" use:stickyShadow>
                <span class="pcr-atb2-browser-section-cat">{section.categoryLabel}</span>
                <span class="pcr-atb2-browser-section-sep">/</span>
                <span class="pcr-atb2-browser-section-grp">{section.groupLabel}</span>
              </div>
              <div class="pcr-atb2-grid">
                {#each section.items as item (item.item_tag)}
                  {@const sectionCardMods = !section.kind && isCustomizableSlot(section.categoryKey, section.groupKey)
                    ? cardModifiers(item, section.categoryKey, section.groupKey) : null}
                  {@const sectionCardDotColor = sectionCardMods?.color ? customizerColorHex(sectionCardMods.color) : null}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  {@const sectionBucket = CATEGORIES.find(c => c.key === section.categoryKey)?.bucket}
                  {@const sectionActiveIdentity =
                    section.kind === "subject-character" ? activeSubject?.character?.tag === item.tag
                    : section.kind === "subject-cast" ? activeSubject?.character?.tag === item.item_tag
                    : false}
                  <div
                    class="pcr-atb2-card"
                    class:selected={section.kind ? sectionActiveIdentity : isSelectedInCategory(item, section.categoryKey, section.groupKey)}
                    class:pcr-atb2-card-unprocessed={!section.kind && isItemUnprocessed(item)}
                    data-item-tag={item.item_tag}
                    onclick={() => {
                      if (section.kind === "subject-character") {
                        if (sectionActiveIdentity) unbindIdentity(activeSubject.id);
                        else pickIdentityFromBrowser(characterToOption(item));
                      } else if (section.kind === "subject-cast") {
                        if (sectionActiveIdentity) unbindIdentity(activeSubject.id);
                        else pickIdentityFromBrowser(castToOption(item, section.castGroup));
                      } else {
                        pickItemFromAll(item, section.categoryKey, section.groupKey);
                      }
                    }}
                    oncontextmenu={(e) => { if (!section.kind && sectionBucket) openChipQaMenu(e, sectionBucket, item); }}
                    title={item.base_natlang || item.display_name || item.item_tag}
                  >
                    {#if section.kind === "subject-character"}
                      <div class="pcr-atb2-card-thumb" class:has-image={characterThumbs.has(item.tag)}>
                        {#if characterThumbs.has(item.tag)}
                          <img src={`/promptchain/tag-builder/thumb/characters/${encodeURIComponent(item.tag)}`} alt="" loading="lazy" />
                        {/if}
                      </div>
                    {:else if section.kind === "subject-cast"}
                      {@const hasImg = castThumbs[section.castGroup]?.has(item.item_tag)}
                      <div class="pcr-atb2-card-thumb" class:has-image={hasImg}>
                        {#if hasImg}
                          <img src={`/promptchain/tag-builder/thumb/${encodeURIComponent(section.castGroup)}/${encodeURIComponent(item.item_tag)}`} alt="" loading="lazy" />
                        {/if}
                      </div>
                    {:else if cat?.bucket && hasThumb(cat.bucket, item.item_tag)}
                      <div class="pcr-atb2-card-thumb has-image">
                        <img src={thumbUrl(cat.bucket, item.item_tag)} alt="" loading="lazy" />
                      </div>
                    {:else if cat?.bucket}
                      <div class="pcr-atb2-card-thumb"></div>
                    {/if}
                    <div class="pcr-atb2-card-name">
                      {#if sectionCardMods}
                        <button
                          class="pcr-atb2-card-mod-dot"
                          class:filled={!!sectionCardDotColor}
                          class:hollow={!sectionCardDotColor}
                          style={sectionCardDotColor ? `background:${sectionCardDotColor}` : ""}
                          title="Edit modifiers"
                          aria-label="Edit modifiers"
                          onclick={(e) => { e.stopPropagation(); editCardModifiers(item, section.categoryKey, section.groupKey); }}
                        ></button>
                      {/if}
                      {item.display_name || item.item_tag}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        {/if}
      {:else if activeCategory === "subjects"}
        {@const sub = activeSubjectSubitem ? SUBJECT_SUBITEMS.find(s => s.key === activeSubjectSubitem) : null}
        {#if !sub || sub.source === "characters"}
            {#if charactersLoading}
              <div class="pcr-atb2-empty">Searching characters…</div>
            {:else if characters.length === 0}
              <div class="pcr-atb2-empty">{searchQuery ? `No characters match "${searchQuery}"` : "No characters."}</div>
            {:else}
              <div class="pcr-atb2-grid">
                {#each characters as char (char.tag)}
                  {@const isActiveIdentity = activeSubject?.character?.tag === char.tag}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="pcr-atb2-card"
                    class:selected={isActiveIdentity}
                    onclick={() => isActiveIdentity ? unbindIdentity(activeSubject.id) : pickIdentityFromBrowser(characterToOption(char))}
                    title={char.base_natlang || `${char.display}${char.series ? " — " + char.series : ""}`}
                  >
                    <div class="pcr-atb2-card-thumb" class:has-image={characterThumbs.has(char.tag)}>
                      {#if characterThumbs.has(char.tag)}
                        <img src={`/promptchain/tag-builder/thumb/characters/${encodeURIComponent(char.tag)}`} alt="" loading="lazy" />
                      {/if}
                    </div>
                    <div class="pcr-atb2-card-name">{char.display || char.tag}</div>
                    {#if char.series}
                      <div class="pcr-atb2-card-group">{char.series}</div>
                    {/if}
                  </div>
                {/each}
              </div>
              {#if charactersTotal > characters.length}
                <div class="pcr-atb2-empty" use:characterLoadMore>
                  {charactersLoadingMore
                    ? "Loading more…"
                    : `Showing ${characters.length} of ${charactersTotal.toLocaleString()} — scroll for more`}
                </div>
              {/if}
            {/if}
          {:else}
            {@const castData = castCache[sub.filter]}
            {#if !castData || castData.loading}
              <div class="pcr-atb2-empty">Loading {sub.label}…</div>
            {:else if !castData.items?.length}
              <div class="pcr-atb2-empty">No {sub.label.toLowerCase()} items.</div>
            {:else}
              <div class="pcr-atb2-grid">
                {#each castData.items as item (item.item_tag)}
                  {@const hasImg = castThumbs[sub.filter]?.has(item.item_tag)}
                  {@const isActiveIdentity = activeSubject?.character?.tag === item.item_tag}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="pcr-atb2-card"
                    class:selected={isActiveIdentity}
                    class:pcr-atb2-card-unprocessed={isItemUnprocessed(item)}
                    onclick={() => isActiveIdentity ? unbindIdentity(activeSubject.id) : pickIdentityFromBrowser(castToOption(item, sub.filter))}
                    oncontextmenu={(e) => openChipQaMenu(e, "cast", item)}
                    title={item.base_natlang || item.display_name || item.item_tag}
                  >
                    <div class="pcr-atb2-card-thumb" class:has-image={hasImg}>
                      {#if hasImg}
                        <img src={`/promptchain/tag-builder/thumb/${encodeURIComponent(sub.filter)}/${encodeURIComponent(item.item_tag)}`} alt="" loading="lazy" />
                      {/if}
                    </div>
                    <div class="pcr-atb2-card-name">{item.display_name || item.item_tag}</div>
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
      {:else if activeCategory === "styles" && !modelInfo?.hash}
        <div class="pcr-atb2-empty">Connect a model to see styles.</div>
      {:else if activeCategory === "styles" && stylesCache.loading}
        <div class="pcr-atb2-empty">Loading styles…</div>
      {:else if activeCategory === "styles" && visibleItems.length === 0}
        <div class="pcr-atb2-empty">No styles found for this model.</div>
      {:else if activeCategory !== "styles" && activeBucketData.loading}
        <div class="pcr-atb2-empty">Loading {activeCategoryDef.label}…</div>
      {:else if visibleItems.length === 0}
        <div class="pcr-atb2-empty">No items.</div>
      {:else if groupedSections}
        {#each groupedSections as section (section.key)}
          <div class="pcr-atb2-browser-section" data-spy-group={section.groupKey} use:spyTarget>
            <div class="pcr-atb2-section-sentinel"></div>
            <div class="pcr-atb2-browser-section-header" use:stickyShadow>
              <span class="pcr-atb2-browser-section-grp">{section.groupLabel}</span>
            </div>
            <div class="pcr-atb2-grid">
              {#each section.items as item (item.item_tag)}
                {@const groupCardMods = isCustomizableSlot(activeCategory, item.item_group)
                  ? cardModifiers(item, activeCategory, item.item_group) : null}
                {@const groupCardDotColor = groupCardMods?.color ? customizerColorHex(groupCardMods.color) : null}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="pcr-atb2-card"
                  class:selected={isSelected(item)}
                  class:pcr-atb2-card-unprocessed={isItemUnprocessed(item)}
                  data-item-tag={item.item_tag}
                  onclick={() => pickItem(item)}
                  oncontextmenu={(e) => { if (activeBucket) openChipQaMenu(e, activeBucket, item); }}
                  title={item.base_natlang || item.display_name || item.item_tag}
                >
                  <div class="pcr-atb2-card-thumb" class:has-image={hasThumb(activeBucket, item.item_tag)}>
                    {#if hasThumb(activeBucket, item.item_tag)}
                      <img src={thumbUrl(activeBucket, item.item_tag)} alt="" loading="lazy" />
                    {/if}
                  </div>
                  <div class="pcr-atb2-card-name">
                    {#if groupCardMods}
                      <button
                        class="pcr-atb2-card-mod-dot"
                        class:filled={!!groupCardDotColor}
                        class:hollow={!groupCardDotColor}
                        style={groupCardDotColor ? `background:${groupCardDotColor}` : ""}
                        title="Edit modifiers"
                        aria-label="Edit modifiers"
                        onclick={(e) => { e.stopPropagation(); editCardModifiers(item, activeCategory, item.item_group); }}
                      ></button>
                    {/if}
                    {item.display_name || item.item_tag}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      {:else}
        <div class="pcr-atb2-grid">
          {#each visibleItems as item (item.item_tag)}
            {@const flatCardMods = isCustomizableSlot(activeCategory, item.item_group)
              ? cardModifiers(item, activeCategory, item.item_group) : null}
            {@const flatCardDotColor = flatCardMods?.color ? customizerColorHex(flatCardMods.color) : null}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="pcr-atb2-card"
              class:selected={isSelected(item)}
              class:pcr-atb2-card-style={activeCategory === "styles"}
              class:pcr-atb2-card-unprocessed={activeCategory !== "styles" && isItemUnprocessed(item)}
              data-item-tag={item.item_tag}
              onclick={() => pickItem(item)}
              oncontextmenu={(e) => { if (activeCategory !== "styles" && activeBucket) openChipQaMenu(e, activeBucket, item); }}
              title={item.base_natlang || item.display_name || item.item_tag}
            >
              {#if activeCategory !== "styles"}
                <div class="pcr-atb2-card-thumb" class:has-image={hasThumb(activeBucket, item.item_tag)}>
                  {#if hasThumb(activeBucket, item.item_tag)}
                    <img src={thumbUrl(activeBucket, item.item_tag)} alt="" loading="lazy" />
                  {/if}
                </div>
              {/if}
              <div class="pcr-atb2-card-name">
                {#if flatCardMods}
                  <button
                    class="pcr-atb2-card-mod-dot"
                    class:filled={!!flatCardDotColor}
                    class:hollow={!flatCardDotColor}
                    style={flatCardDotColor ? `background:${flatCardDotColor}` : ""}
                    title="Edit modifiers"
                    aria-label="Edit modifiers"
                    onclick={(e) => { e.stopPropagation(); editCardModifiers(item, activeCategory, item.item_group); }}
                  ></button>
                {/if}
                {item.display_name || item.item_tag}
              </div>
              {#if activeCategory === "styles"}
                <div class="pcr-atb2-card-group">{item.tags?.length ?? 0} tags</div>
              {:else if !activeGroup}
                <div class="pcr-atb2-card-group">{groupDisplay(activeBucket, item.item_group)}</div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </main>

    <!-- RIGHT: OUTLINE / CHECKOUT -->
    <aside class="pcr-atb2-outline">
      <div class="pcr-atb2-outline-heading">Subjects &amp; Scene</div>

      <!-- Subject cards -->
      {#each subjects as subj (subj.id)}
        {@const typeDef = SUBJECT_TYPES[subj.type] || SUBJECT_TYPES.person}
        {@const isActive = activeSubjectId === subj.id}
        {@const charThumbBucket =
          subj.character?.kind === "cast" ? subj.character.group :
          subj.character ? "characters" : null}
        {@const charThumbHas =
          subj.character?.kind === "cast"
            ? !!castThumbs[subj.character.group]?.has(subj.character.tag)
            : !!(subj.character && characterThumbs.has(subj.character.tag))}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="pcr-atb2-card2 pcr-atb2-subject-card"
          class:active={isActive}
          onclick={() => setActiveSubject(subj.id)}
          style="--subj-color:{typeDef.color}"
        >
          <div class="pcr-atb2-card2-header">
            {#if subj.character && charThumbHas}
              <span class="pcr-atb2-card2-avatar pcr-atb2-card2-avatar-img" style="border-color:{typeDef.color}">
                <img src={`/promptchain/tag-builder/thumb/${encodeURIComponent(charThumbBucket)}/${encodeURIComponent(subj.character.tag)}`} alt="" />
              </span>
            {:else}
              <span class="pcr-atb2-card2-avatar" style="background:{typeDef.color}">{subj.letter}</span>
            {/if}
            <input
              class="pcr-atb2-subject-name"
              value={subj.name}
              oninput={(e) => renameSubject(subj.id, e.target.value)}
              onclick={(e) => e.stopPropagation()}
            />
            <span class="pcr-atb2-card2-tag">{typeDef.label}</span>
            {#if regionMode}
              <span class="pcr-atb2-card2-tag" title="The regional block this subject rebuilds into">
                {subj.regionName || "+ new block"}
              </span>
            {/if}
            <button
              class="pcr-atb2-card2-delete"
              aria-label="Delete subject"
              onclick={(e) => { e.stopPropagation(); deleteSubject(subj.id); }}
            >&times;</button>
          </div>

          <div class="pcr-atb2-subj-section">
            <div class="pcr-atb2-subj-section-header">Subject</div>
            <div class="pcr-atb2-slot">
              <span class="pcr-atb2-slot-label">Identity</span>
              <span class="pcr-atb2-slot-value">
                <span class="pcr-atb2-preset-row">
                  <button
                    class="pcr-atb2-preset-select pcr-atb2-identity-trigger"
                    type="button"
                    onclick={(e) => { e.stopPropagation(); toggleIdentityPicker(subj.id, e.currentTarget); }}
                  >
                    <span class="pcr-atb2-identity-trigger-label">
                      {#if subj.character}{subj.character.display}{#if subj.character.series} — {subj.character.series}{/if}{:else}Pick an identity…{/if}
                    </span>
                    <span class="pcr-atb2-identity-trigger-chev">▾</span>
                  </button>
                  {#if subj.character}
                    <button
                      class="pcr-atb2-preset-clear"
                      title="Unbind identity"
                      onclick={(e) => { e.stopPropagation(); unbindIdentity(subj.id); }}
                    >&times;</button>
                  {/if}
                </span>
              </span>
            </div>
            <div class="pcr-atb2-slot">
              <span class="pcr-atb2-slot-label">Outfit</span>
              <span class="pcr-atb2-slot-value">
                <span class="pcr-atb2-preset-row">
                  <button
                    class="pcr-atb2-preset-select pcr-atb2-preset-trigger"
                    type="button"
                    onclick={(e) => { e.stopPropagation(); togglePresetPicker("outfit", subj.id, e.currentTarget); }}
                  >
                    <span class="pcr-atb2-preset-trigger-label">
                      {#if subj.activeOutfit}
                        {subj.activeOutfit.name}{#if subj.activeOutfit.character_tag !== subj.character?.tag} — {subj.activeOutfit.character_display}{/if}
                      {:else}
                        Pick outfit…
                      {/if}
                    </span>
                    <span class="pcr-atb2-preset-trigger-chev">▾</span>
                  </button>
                  {#if subj.activeOutfit}
                    <button
                      class="pcr-atb2-preset-clear"
                      title="Remove outfit"
                      onclick={(e) => { e.stopPropagation(); removePreset(subj.id, "outfit"); }}
                    >&times;</button>
                  {/if}
                </span>
              </span>
            </div>
            <div class="pcr-atb2-slot">
              <span class="pcr-atb2-slot-label">Pose</span>
              <span class="pcr-atb2-slot-value">
                <span class="pcr-atb2-preset-row">
                  <button
                    class="pcr-atb2-preset-select pcr-atb2-preset-trigger"
                    type="button"
                    onclick={(e) => { e.stopPropagation(); togglePresetPicker("pose", subj.id, e.currentTarget); }}
                  >
                    <span class="pcr-atb2-preset-trigger-label">
                      {#if subj.activePose}
                        {subj.activePose.name}{#if subj.activePose.character_tag !== subj.character?.tag} — {subj.activePose.character_display}{/if}
                      {:else}
                        Pick pose…
                      {/if}
                    </span>
                    <span class="pcr-atb2-preset-trigger-chev">▾</span>
                  </button>
                  {#if subj.activePose}
                    <button
                      class="pcr-atb2-preset-clear"
                      title="Remove pose"
                      onclick={(e) => { e.stopPropagation(); removePreset(subj.id, "pose"); }}
                    >&times;</button>
                  {/if}
                </span>
              </span>
            </div>
          </div>

          {#each typeDef.slotCategories as catKey}
            {@const catDef = CATEGORIES.find(c => c.key === catKey)}
            {#if catDef && catDef.enabled && bucketCache[catDef.bucket]?.groups?.length && subjNsfwSectionVisible(catKey, subj)}
              {@const catGroups = bucketCache[catDef.bucket].groups}
              {@const catSlots = subj.slots[catKey] || {}}
              {@const multiSet = MULTI_GROUPS[catDef.bucket] || new Set()}
              {@const emptyCount = catGroups.filter(g => !((catSlots[g.group_name] || []).length)).length}
              {@const isExpanded = !!subj.expandedSections?.[catKey]}
              {@const hasChev = emptyCount > 0}
              <div class="pcr-atb2-subj-section">
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="pcr-atb2-subj-section-header"
                  class:clickable={hasChev}
                  onclick={(e) => { if (hasChev) { e.stopPropagation(); toggleSubjectSection(subj.id, catKey); } }}
                >
                  <span class="pcr-atb2-subj-section-title">{catDef.label}</span>
                  {#if hasChev}
                    <span class="pcr-atb2-section-chev">{isExpanded ? "▾" : "▸"} +{emptyCount}</span>
                  {/if}
                </div>
                {#if catKey === "appearance" && subj.character}
                  <div class="pcr-atb2-slot">
                    <span class="pcr-atb2-slot-label">Identity</span>
                    <span class="pcr-atb2-slot-value">
                      <!-- svelte-ignore a11y_click_events_have_key_events -->
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <span
                        class="pcr-atb2-chip pcr-atb2-chip-identity pcr-atb2-chip-jumpable"
                        onclick={(e) => { e.stopPropagation(); jumpToIdentity(subj.id); }}
                        title="Jump to Subjects"
                      >
                        {subj.character.display}
                        <button
                          class="pcr-atb2-chip-x"
                          aria-label="Remove"
                          onclick={(e) => { e.stopPropagation(); unbindIdentity(subj.id); }}
                        >&times;</button>
                      </span>
                    </span>
                  </div>
                {/if}
                {#if catKey === "appearance"}
                  <div class="pcr-atb2-slot">
                    <span class="pcr-atb2-slot-label">Modifiers</span>
                    <span class="pcr-atb2-slot-value">
                      {#each (subj.modifiers || []) as tok, mi (tok + " " + mi)}
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <span
                          class="pcr-atb2-chip pcr-atb2-chip-modifier pcr-atb2-chip-jumpable"
                          onclick={(e) => { e.stopPropagation(); jumpToModifier(subj.id, tok); }}
                          title="Jump to Modifiers"
                        >
                          {tok}
                          <button
                            class="pcr-atb2-chip-x"
                            aria-label="Remove"
                            onclick={(e) => { e.stopPropagation(); removeModifier(subj.id, tok); }}
                          >&times;</button>
                        </span>
                      {/each}
                      <!-- svelte-ignore a11y_click_events_have_key_events -->
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <span
                        class="pcr-atb2-slot-add pcr-atb2-modifier-trigger"
                        onclick={(e) => { e.stopPropagation(); openModifierPicker(subj.id, e.currentTarget); }}
                      >+ add</span>
                    </span>
                  </div>
                {/if}
                {#each catGroups as g}
                  {@const sel = catSlots[g.group_name] || []}
                  {@const isMulti = multiSet.has(g.group_name)}
                  {@const customizable = isCustomizableClothing(catKey, g.group_name)}
                  {#if sel.length > 0 || isExpanded}
                    <div class="pcr-atb2-slot">
                      <span class="pcr-atb2-slot-label">
                        {g.display_name || g.group_name}
                        {#if isMulti}<span class="pcr-atb2-slot-multi" title="Multi-select">+</span>{/if}
                      </span>
                      <span class="pcr-atb2-slot-value">
                        {#each sel as item (item.item_tag)}
                          {@const hasMods = !!item.modifiers}
                          {@const isFurn = isFurnitureChip(item)}
                          {@const capColor = isFurn
                            ? (item._furniture.color ? customizerColorHex(item._furniture.color) : null)
                            : hasMods ? customizerColorHex(item.modifiers?.color) : null}
                          {@const modTooltip = isFurn ? "Edit furniture" : hasMods ? modifierTooltip(item) : ""}
                          <!-- svelte-ignore a11y_click_events_have_key_events -->
                          <!-- svelte-ignore a11y_no_static_element_interactions -->
                          <span
                            class="pcr-atb2-chip pcr-atb2-chip-jumpable"
                            class:pcr-atb2-chip-customized={hasMods || isFurn}
                            class:pcr-atb2-chip-unprocessed={isItemUnprocessed(item)}
                          >
                            {#if hasMods || isFurn}
                              <!-- svelte-ignore a11y_click_events_have_key_events -->
                              <!-- svelte-ignore a11y_no_static_element_interactions -->
                              <span
                                class="pcr-atb2-chip-cap"
                                class:pcr-atb2-chip-cap-filled={!!capColor || isFurn}
                                class:pcr-atb2-chip-cap-hollow={!capColor && !isFurn}
                                style={capColor ? `background:${capColor}` : isFurn ? "background:#7c3aed" : ""}
                                title={modTooltip}
                                onclick={(e) => {
                                  e.stopPropagation();
                                  if (isFurn) openFurnitureCustomizerForExisting(item, subj.id, g.group_name);
                                  else if (isCustomizableAppearance(catKey, g.group_name)) openFantasyCustomizerForExisting(subj.id, item);
                                  else openCustomizerForExisting(subj.id, catKey, g.group_name, item);
                                }}
                              ></span>
                            {/if}
                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <span
                              class="pcr-atb2-chip-body"
                              onclick={(e) => {
                                e.stopPropagation();
                                jumpToSlotChip(subj.id, catKey, g.group_name, item.item_tag);
                              }}
                              title={`Jump to ${catDef.label} / ${g.display_name || g.group_name}`}
                            >
                              {item.display_name || item.item_tag}
                            </span>
                            <button
                              class="pcr-atb2-chip-x"
                              aria-label="Clear"
                              onclick={(e) => { e.stopPropagation(); clearSubjectChip(subj.id, catKey, g.group_name, item.item_tag); }}
                            >&times;</button>
                          </span>
                        {/each}
                        {#if sel.length === 0 || isMulti}
                          <!-- svelte-ignore a11y_click_events_have_key_events -->
                          <!-- svelte-ignore a11y_no_static_element_interactions -->
                          <span
                            class="pcr-atb2-slot-add"
                            onclick={(e) => { e.stopPropagation(); jumpToSlot(subj.id, catKey, g.group_name); }}
                          >+ add</span>
                        {/if}
                      </span>
                    </div>
                  {/if}
                {/each}
              </div>
            {/if}
          {/each}

          {#if subj.freeform && subj.freeform.length}
            <div class="pcr-atb2-subj-section">
              <div class="pcr-atb2-subj-section-header">
                <span class="pcr-atb2-subj-section-title">Custom / Freeform</span>
              </div>
              <div class="pcr-atb2-slot">
                <span class="pcr-atb2-slot-value">
                  {#each subj.freeform as tok, ti (tok + " " + ti)}
                    <span class="pcr-atb2-chip pcr-atb2-chip-freeform">
                      {tok}
                      <button
                        class="pcr-atb2-chip-x"
                        aria-label="Remove"
                        onclick={(e) => { e.stopPropagation(); removeFreeform(subj.id, tok); }}
                      >&times;</button>
                    </span>
                  {/each}
                </span>
              </div>
            </div>
          {/if}

          <!-- Section-anchored freeform — phrases the parser couldn't bind
               but tagged with their source section. Grouped so the user can
               see (and remove) them per section instead of guessing where
               an un-bound chunk ended up. -->
          {#each ["outfit", "pose", "interaction", "scene"] as sectionKey}
            {@const items = subj.sectionFreeform?.[sectionKey] || []}
            {#if items.length}
              <div class="pcr-atb2-subj-section">
                <div class="pcr-atb2-subj-section-header">
                  <span class="pcr-atb2-subj-section-title">Unbound ({sectionKey})</span>
                </div>
                <div class="pcr-atb2-slot">
                  <span class="pcr-atb2-slot-value">
                    {#each items as tok (tok)}
                      <span class="pcr-atb2-chip pcr-atb2-chip-freeform">
                        {tok}
                        <button
                          class="pcr-atb2-chip-x"
                          aria-label="Remove"
                          onclick={(e) => { e.stopPropagation(); removeSectionFreeform(subj.id, sectionKey, tok); }}
                        >&times;</button>
                      </span>
                    {/each}
                  </span>
                </div>
              </div>
            {/if}
          {/each}
        </div>
      {/each}

      <!-- Add Subject button -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="pcr-atb2-add-subject" onclick={() => spawnSubject("person")}>+ Add Subject</div>

      <!-- Scene card (opt-in, single instance) -->
      {#if sceneSpawned}
        <div class="pcr-atb2-card2 pcr-atb2-scene-card" class:active={activeCategoryDef.scope === "global"}>
          <div class="pcr-atb2-card2-header">
            <span class="pcr-atb2-card2-avatar pcr-atb2-scene-avatar">🏠</span>
            <span class="pcr-atb2-card2-title">Scene</span>
            <span class="pcr-atb2-card2-tag">Shared</span>
            <button
              class="pcr-atb2-card2-delete"
              aria-label="Delete scene"
              onclick={deleteScene}
            >&times;</button>
          </div>

          {#each sceneGroupsList as g}
            {@const sel = sceneSelections[g.group_name] || []}
            {@const isMulti = (MULTI_GROUPS.scene).has(g.group_name)}
            <div class="pcr-atb2-slot">
              <span class="pcr-atb2-slot-label">
                {g.display_name || g.group_name}
                {#if isMulti}<span class="pcr-atb2-slot-multi" title="Multi-select">+</span>{/if}
              </span>
              <span class="pcr-atb2-slot-value">
                {#each sel as item (item.item_tag)}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <span
                    class="pcr-atb2-chip pcr-atb2-chip-jumpable"
                    class:pcr-atb2-chip-unprocessed={isItemUnprocessed(item)}
                    onclick={(e) => { e.stopPropagation(); jumpToTag({ category: "scene", group: g.group_name, itemTag: item.item_tag }); }}
                    title="Jump to Scene / {g.display_name || g.group_name}"
                  >
                    {item.display_name || item.item_tag}
                    <button class="pcr-atb2-chip-x" aria-label="Clear" onclick={(e) => { e.stopPropagation(); clearSceneChip(g.group_name, item.item_tag); }}>&times;</button>
                  </span>
                {/each}
                {#if sel.length === 0 || isMulti}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <span
                    class="pcr-atb2-slot-add"
                    onclick={() => { activeCategory = "scene"; activeGroup = g.group_name; }}
                  >+ add</span>
                {/if}
              </span>
            </div>
          {/each}

          <!-- Scene freeform — scene-section phrases that bound to no chip
               (e.g. from editing outside the regional blocks). Shown so the
               user can see and remove them; they round-trip under // Scene. -->
          {#if sceneFreeform.length}
            <div class="pcr-atb2-slot">
              <span class="pcr-atb2-slot-label">Custom / Freeform</span>
              <span class="pcr-atb2-slot-value">
                {#each sceneFreeform as tok, ti (tok + " " + ti)}
                  <span class="pcr-atb2-chip pcr-atb2-chip-freeform">
                    {tok}
                    <button
                      class="pcr-atb2-chip-x"
                      aria-label="Remove"
                      onclick={(e) => { e.stopPropagation(); removeSceneFreeform(tok); }}
                    >&times;</button>
                  </span>
                {/each}
              </span>
            </div>
          {/if}

          <!-- Scene prop chips, grouped by prop category. -->
          {#each (bucketCache.furniture?.groups || []) as fg}
            {@const fsel = sceneSelections[fg.group_name] || []}
            {#if fsel.length > 0}
              <div class="pcr-atb2-slot">
                <span class="pcr-atb2-slot-label">
                  {fg.icon || "📦"} {fg.display_name || fg.group_name}
                  <span class="pcr-atb2-slot-multi" title="Multi-select">+</span>
                </span>
                <span class="pcr-atb2-slot-value">
                  {#each fsel as item (item.item_tag)}
                    {@const isCustomized = isFurnitureChip(item)}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <span class="pcr-atb2-chip" class:pcr-atb2-chip-customized={isCustomized}>
                      {#if isCustomized}
                        {@const sceneCapColor = item._furniture.color ? customizerColorHex(item._furniture.color) : null}
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <span
                          class="pcr-atb2-chip-cap pcr-atb2-chip-cap-filled"
                          style={sceneCapColor ? `background:${sceneCapColor}` : "background:#7c3aed"}
                          title="Edit prop"
                          onclick={(e) => { e.stopPropagation(); openFurnitureCustomizerForExisting(item, null, fg.group_name); }}
                        ></span>
                      {/if}
                      <span class="pcr-atb2-chip-body">{item.display_name || item.item_tag}</span>
                      <button class="pcr-atb2-chip-x" aria-label="Clear" onclick={(e) => { e.stopPropagation(); clearSceneChip(fg.group_name, item.item_tag); }}>&times;</button>
                    </span>
                  {/each}
                </span>
              </div>
            {/if}
          {/each}
        </div>
      {:else}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="pcr-atb2-add-subject pcr-atb2-add-scene" onclick={spawnScene}>+ Add Scene</div>
      {/if}

      <!-- Style card (model-scoped, single instance) -->
      {#if styleSpawned && activeStyle}
        <div class="pcr-atb2-card2 pcr-atb2-style-card">
          <div class="pcr-atb2-card2-header">
            <span class="pcr-atb2-card2-avatar pcr-atb2-style-avatar">🎨</span>
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <span
              class="pcr-atb2-card2-title pcr-atb2-style-title"
              onclick={(e) => { e.stopPropagation(); jumpToTag({ category: "styles", itemTag: activeStyle.id }); }}
              title="Jump to Styles"
            >{activeStyle.name}</span>
            <span class="pcr-atb2-card2-tag">Style</span>
            <button
              class="pcr-atb2-card2-delete"
              aria-label="Remove style"
              onclick={deleteStyleCard}
            >&times;</button>
          </div>
          <div class="pcr-atb2-slot">
            <span class="pcr-atb2-slot-value">
              {#each activeStyle.tags as tag (tag)}
                <span class="pcr-atb2-chip pcr-atb2-chip-style">{tag}</span>
              {/each}
            </span>
          </div>
        </div>
      {:else if modelInfo?.hash}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="pcr-atb2-add-subject pcr-atb2-add-style"
          onclick={() => { activeCategory = "styles"; activeGroup = null; }}
        >+ Add Style</div>
      {/if}
    </aside>
  </div>

  <div class="pcr-atb2-footer">
    <div class="pcr-atb2-mode-toggle" role="radiogroup" aria-label="Output format">
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="pcr-atb2-mode-option" class:active={!isNaturalMode} role="radio" aria-checked={!isNaturalMode} tabindex="0" onclick={() => setMode(false)}>Tags</div>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="pcr-atb2-mode-option" class:active={isNaturalMode} role="radio" aria-checked={isNaturalMode} tabindex="0" onclick={() => setMode(true)}>Natural Language</div>
    </div>

    <button
      class="pcr-atb2-nsfw-toggle"
      class:active={!nsfwHidden}
      title={nsfwHidden ? "NSFW hidden in the browser — click to show. (Already-added chips are unaffected.)" : "NSFW shown — click to hide"}
      aria-pressed={!nsfwHidden}
      onclick={toggleNsfw}
    >🌶️ NSFW</button>

    <div class="pcr-atb2-footer-spacer"></div>

    <button class="pcr-atb2-btn pcr-atb2-btn-cancel" onclick={onClose}>Cancel</button>
    <button class="pcr-atb2-btn pcr-atb2-btn-insert" onclick={handleInsert} disabled={totalSelectionCount === 0}>
      Insert{totalSelectionCount > 0 ? ` (${totalSelectionCount})` : ""}
    </button>
  </div>

  {#if chipQaMenu}
    {@const curStatus = chipQaMenu.item.natlang_status ?? "unprocessed"}
    {@const tagOutput = chipQaMenu.item.base_tags || chipQaMenu.item.item_tag}
    {@const natlangOutput = chipQaMenu.item.base_natlang || ""}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="pcr-atb2-qa-overlay" onclick={closeChipQaMenu} oncontextmenu={(e) => { e.preventDefault(); closeChipQaMenu(); }}></div>
    <div class="pcr-atb2-qa-menu" style="left:{chipQaMenu.x}px;top:{chipQaMenu.y}px">
      <div class="pcr-atb2-qa-menu-title">{chipQaMenu.item.display_name || chipQaMenu.item.item_tag}</div>
      <div class="pcr-atb2-qa-menu-preview">
        <div class="pcr-atb2-qa-block">
          <div class="pcr-atb2-qa-block-label">Tag</div>
          <div class="pcr-atb2-qa-block-value pcr-atb2-qa-block-mono">{tagOutput}</div>
        </div>
        <div class="pcr-atb2-qa-block">
          <div class="pcr-atb2-qa-block-label">Natlang</div>
          <div class="pcr-atb2-qa-block-value">{natlangOutput || "(empty)"}</div>
        </div>
      </div>
      <div class="pcr-atb2-qa-menu-actions">
        <button class="pcr-atb2-qa-menu-item" class:current={curStatus === "normalized"} onclick={() => setChipNatlangStatus(chipQaMenu.bucket, chipQaMenu.item, "normalized")}>
          <span class="pcr-atb2-qa-dot pcr-atb2-qa-dot-ready"></span> Mark Ready
        </button>
        <button class="pcr-atb2-qa-menu-item" class:current={curStatus === "unprocessed"} onclick={() => setChipNatlangStatus(chipQaMenu.bucket, chipQaMenu.item, "unprocessed")}>
          <span class="pcr-atb2-qa-dot pcr-atb2-qa-dot-unprocessed"></span> Mark Unprocessed
        </button>
        <button class="pcr-atb2-qa-menu-item" class:current={curStatus === "broken"} onclick={() => setChipNatlangStatus(chipQaMenu.bucket, chipQaMenu.item, "broken")}>
          <span class="pcr-atb2-qa-dot pcr-atb2-qa-dot-broken"></span> Mark Broken
        </button>
      </div>
    </div>
  {/if}
</div>

<!-- IDENTITY PICKER (fixed-positioned to escape outline overflow) -->
{#if identityPickerOpen}
  <div
    class="pcr-atb2-identity-dd"
    style="left:{identityPickerRect.left}px; top:{identityPickerRect.top}px; width:{identityPickerRect.width}px;"
    onclick={(e) => e.stopPropagation()}
  >
    <input
      class="pcr-atb2-identity-dd-search"
      type="text"
      placeholder="Search subjects…"
      bind:value={identityPickerQuery}
      bind:this={identityPickerSearchEl}
    />
    <div class="pcr-atb2-identity-dd-list">
      {#if identityCharLoading && identityResults.length === 0}
        <div class="pcr-atb2-identity-dd-empty">Searching…</div>
      {:else if identityResults.length === 0}
        <div class="pcr-atb2-identity-dd-empty">No matches.</div>
      {:else}
        {#each identityResults as opt (opt.kind + ":" + opt.tag)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="pcr-atb2-identity-dd-row"
            onclick={() => pickIdentityFromDropdown(opt)}
          >
            <span class="pcr-atb2-identity-dd-name">{opt.display}</span>
            <span class="pcr-atb2-identity-dd-meta">
              {#if opt.kind === "character" && opt.series}{opt.series}{:else}{opt.kindLabel}{/if}
            </span>
          </div>
        {/each}
      {/if}
    </div>
  </div>
{/if}

<!-- OUTFIT/POSE PRESET PICKER -->
{#if presetPickerOpen}
  {@const subj = subjects.find(s => s.id === presetPickerOpen.subjId)}
  {@const boundTag = subj?.character?.tag}
  <div
    class="pcr-atb2-preset-dd"
    style="left:{presetPickerRect.left}px; top:{presetPickerRect.top}px; width:{presetPickerRect.width}px;"
    onclick={(e) => e.stopPropagation()}
  >
    <input
      class="pcr-atb2-preset-dd-search"
      type="text"
      placeholder={presetPickerOpen.kind === "outfit" ? "Search outfits…" : "Search poses…"}
      bind:value={presetPickerQuery}
      bind:this={presetPickerSearchEl}
    />
    <div class="pcr-atb2-preset-dd-list">
      {#if presetPickerLoading && presetPickerResults.length === 0}
        <div class="pcr-atb2-preset-dd-empty">Loading…</div>
      {:else if presetPickerResults.length === 0}
        <div class="pcr-atb2-preset-dd-empty">No matches.</div>
      {:else}
        {#each presetPickerResults as row (row.id)}
          {@const isCanonical = row.character_tag === boundTag}
          {@const presetName = presetPickerOpen.kind === "outfit" ? row.outfit_name : row.pose_name}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="pcr-atb2-preset-dd-row"
            class:canonical={isCanonical}
            onclick={() => pickPresetFromDropdown(row)}
          >
            {#if isCanonical}<span class="pcr-atb2-preset-dd-star" title="Canonical for bound character">★</span>{/if}
            <span class="pcr-atb2-preset-dd-name">{presetName}</span>
            <span class="pcr-atb2-preset-dd-meta">{row.character_display}{row.character_series ? ` · ${row.character_series}` : ""}</span>
          </div>
        {/each}
      {/if}
    </div>
  </div>
{/if}

<!-- MODIFIER PICKER -->
{#if modifierPickerOpen}
  {@const subj = subjects.find(s => s.id === modifierPickerOpen)}
  <div
    class="pcr-atb2-modifier-dd"
    style="left:{modifierPickerRect.left}px; top:{modifierPickerRect.top}px; width:{modifierPickerRect.width}px;"
    onclick={(e) => e.stopPropagation()}
  >
    <div class="pcr-atb2-modifier-dd-list">
      {#each MODIFIER_OPTIONS as opt (opt)}
        {@const isOn = !!subj?.modifiers?.includes(opt)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="pcr-atb2-modifier-dd-row"
          class:on={isOn}
          onclick={() => { toggleModifier(modifierPickerOpen, opt); closeModifierPicker(); }}
        >
          <span class="pcr-atb2-modifier-dd-check">{isOn ? "✓" : ""}</span>
          <span class="pcr-atb2-modifier-dd-name">{opt}</span>
        </div>
      {/each}
    </div>
  </div>
{/if}

<!-- IDENTITY SWAP CONFIRMATION -->
{#if pendingIdentitySwap}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="pcr-atb2-modal-backdrop" onclick={cancelIdentitySwap}>
    <div class="pcr-atb2-modal" onclick={(e) => e.stopPropagation()}>
      <div class="pcr-atb2-modal-title">Swap identity?</div>
      <div class="pcr-atb2-modal-body">
        Replace <strong>{pendingIdentitySwap.current.display}</strong> with <strong>{pendingIdentitySwap.next.display}</strong>?
        <div class="pcr-atb2-modal-note">
          Identity-derived tags from {pendingIdentitySwap.current.display} will be removed and replaced.
        </div>
      </div>
      <div class="pcr-atb2-modal-footer">
        <button class="pcr-atb2-btn pcr-atb2-btn-cancel" onclick={cancelIdentitySwap}>Cancel</button>
        <button class="pcr-atb2-btn pcr-atb2-btn-insert" onclick={confirmIdentitySwap}>Swap</button>
      </div>
    </div>
  </div>
{/if}

<!-- CLOTHING CUSTOMIZER -->
{#if customizerOpen}
  <Customizer
    item={customizerOpen.item}
    initial={customizerOpen.initial}
    isNaturalMode={isNaturalMode}
    onConfirm={commitCustomizer}
    onCancel={cancelCustomizer}
  />
{/if}

<!-- PROPS CUSTOMIZER -->
{#if furnitureCustomizerOpen && bucketCache.furniture?.mods}
  <FurnitureCustomizer
    item={furnitureCustomizerOpen.item}
    materials={bucketCache.furniture.mods.materials}
    patterns={bucketCache.furniture.mods.patterns}
    colors={bucketCache.furniture.mods.colors}
    actions={furnitureActions}
    actionOverrides={bucketCache.furniture.mods.actionOverrides || {}}
    contextSubject={furnitureCustomizerOpen.subjId
      ? subjects.find(s => s.id === furnitureCustomizerOpen.subjId)
      : null}
    initial={furnitureCustomizerOpen.initial}
    isNaturalMode={isNaturalMode}
    onConfirm={commitFurnitureCustomizer}
    onCancel={cancelFurnitureCustomizer}
  />
{/if}

<!-- FANTASY CUSTOMIZER -->
{#if fantasyCustomizerOpen}
  <FantasyCustomizer
    item={fantasyCustomizerOpen.item}
    data={fantasyModData}
    initial={fantasyCustomizerOpen.initial}
    isNaturalMode={isNaturalMode}
    onConfirm={commitFantasyCustomizer}
    onCancel={cancelFantasyCustomizer}
  />
{/if}

<style>
  .pcr-atb2 {
    width: min(95vw, 1200px);
    height: 88vh;
  }

  .pcr-atb2-close,
  .pcr-atb2-titlebar-btn {
    background: transparent;
    border: none;
    color: #888;
    font-size: 22px;
    line-height: 1;
    padding: 4px 10px;
    cursor: pointer;
    border-radius: 3px;
  }
  .pcr-atb2-close:hover,
  .pcr-atb2-titlebar-btn:hover { background: #3a3a3a; color: #ddd; }
  .pcr-atb2-titlebar-btn { font-size: 16px; }

  :global(.pcr-atb-panel.pcr-atb-maximized) {
    width: 100vw !important;
    height: 100vh !important;
    border-radius: 0 !important;
    border: none !important;
  }

  .pcr-atb2-rail,
  .pcr-atb2-browser,
  .pcr-atb2-outline {
    scrollbar-width: thin;
    scrollbar-color: #3a3a3a transparent;
  }
  .pcr-atb2-rail::-webkit-scrollbar,
  .pcr-atb2-browser::-webkit-scrollbar,
  .pcr-atb2-outline::-webkit-scrollbar { width: 8px; height: 8px; }
  .pcr-atb2-rail::-webkit-scrollbar-track,
  .pcr-atb2-browser::-webkit-scrollbar-track,
  .pcr-atb2-outline::-webkit-scrollbar-track { background: transparent; }
  .pcr-atb2-rail::-webkit-scrollbar-thumb,
  .pcr-atb2-browser::-webkit-scrollbar-thumb,
  .pcr-atb2-outline::-webkit-scrollbar-thumb { background: #3a3a3a; border-radius: 4px; }
  .pcr-atb2-rail::-webkit-scrollbar-thumb:hover,
  .pcr-atb2-browser::-webkit-scrollbar-thumb:hover,
  .pcr-atb2-outline::-webkit-scrollbar-thumb:hover { background: #555; }

  .pcr-atb2-body {
    display: grid;
    grid-template-columns: 220px 1fr 340px;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* ---- LEFT RAIL ---- */
  .pcr-atb2-rail {
    background: #1a1a1a;
    border-right: 1px solid #333;
    overflow-y: auto;
    padding: 8px 0;
  }
  .pcr-atb2-rail-heading {
    color: #666;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    padding: 8px 14px 6px;
  }
  .pcr-atb2-rail-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    color: #aaa;
    cursor: pointer;
    font-size: 13px;
  }
  .pcr-atb2-rail-item:hover:not(.disabled) { background: #242424; color: #ddd; }
  .pcr-atb2-rail-item.active {
    background: #2a2540;
    color: #fff;
    border-left: 2px solid #8b5cf6;
    padding-left: 12px;
  }
  .pcr-atb2-rail-item.disabled { color: #555; cursor: not-allowed; }
  .pcr-atb2-rail-icon { font-size: 14px; width: 18px; text-align: center; }
  .pcr-atb2-rail-label { flex: 1; }
  .pcr-atb2-rail-count {
    color: #555;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .pcr-atb2-rail-drilldown {
    background: #161616;
    border-bottom: 1px solid #333;
    padding: 4px 0;
  }
  .pcr-atb2-rail-sub {
    display: flex;
    align-items: center;
    padding: 6px 14px 6px 36px;
    color: #888;
    cursor: pointer;
    font-size: 12px;
  }
  .pcr-atb2-rail-sub:hover { background: #1f1f1f; color: #ccc; }
  .pcr-atb2-rail-sub.active { color: #d4b8ff; background: #221c33; }
  .pcr-atb2-rail-sub-label { flex: 1; }

  /* ---- MIDDLE: BROWSER ---- */
  .pcr-atb2-browser {
    background: #1e1e1e;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .pcr-atb2-browser-header {
    padding: 12px 16px;
    border-bottom: 1px solid #2a2a2a;
    color: #888;
    font-size: 12px;
    display: flex;
    align-items: center;
  }
  .pcr-atb2-breadcrumb { display: inline-flex; gap: 6px; align-items: center; }
  .pcr-atb2-bc-target strong { color: #d4b8ff; }
  .pcr-atb2-bc-sep { color: #555; }
  .pcr-atb2-bc-group { color: #ccc; font-weight: 500; }
  .pcr-atb2-view-toggle { margin-left: auto; display: inline-flex; gap: 2px; flex: 0 0 auto; }
  .pcr-atb2-view-btn {
    background: #222;
    border: 1px solid #333;
    color: #888;
    width: 26px;
    height: 22px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    padding: 0;
  }
  .pcr-atb2-view-btn:hover { color: #ccc; border-color: #555; }
  .pcr-atb2-view-btn.active { background: #3a2a4a; color: #d4b8ff; border-color: #5a4a6a; }

  .pcr-atb2-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--pcr-atb2-card-min, 130px), 1fr));
    gap: 10px;
    padding: 14px;
  }

  .pcr-atb2-browser-section { position: relative; }
  .pcr-atb2-browser-section + .pcr-atb2-browser-section {
    border-top: 1px solid #2a2a2a;
  }
  .pcr-atb2-browser-section .pcr-atb2-grid {
    padding-top: 4px;
  }
  /* Zero-size probe at each section's top edge. The sticky-shadow action
     watches it cross the scroll viewport to know when the header is pinned. */
  .pcr-atb2-section-sentinel {
    position: absolute;
    top: 0;
    left: 0;
    width: 1px;
    height: 1px;
    pointer-events: none;
  }
  .pcr-atb2-browser-section-header {
    position: sticky;
    top: 0;
    z-index: 5;
    background: #1e1e1e;
    box-shadow: 0 0 0 0 rgba(0, 0, 0, 0);
    transition: box-shadow 0.12s;
    color: #b8b8b8;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    padding: 12px 16px 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  /* Shadow only while actually pinned (toggled by the sticky-shadow action). */
  .pcr-atb2-browser-section-header.pcr-atb2-section-stuck {
    box-shadow: 0 6px 6px -6px rgba(0, 0, 0, 0.6);
  }
  .pcr-atb2-browser-section-cat { color: #888; }
  .pcr-atb2-browser-section-sep { color: #555; }
  .pcr-atb2-browser-section-grp { color: #d4b8ff; }
  .pcr-atb2-recent-section .pcr-atb2-browser-section-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pcr-atb2-recent-clear {
    margin-left: auto;
    background: none;
    border: 1px solid #333;
    color: #777;
    border-radius: 4px;
    font: inherit;
    font-size: 10px;
    padding: 1px 8px;
    cursor: pointer;
  }
  .pcr-atb2-recent-clear:hover { color: #ccc; border-color: #555; }
  .pcr-atb2-card {
    background: #ffffff0d;
    border: 1px solid #333;
    border-radius: 6px;
    padding: 8px;
    cursor: pointer;
    transition: all 0.12s;
    display: flex;
    flex-direction: column;
    gap: 6px;
    position: relative;
    /* The "all" view mounts thousands of cards but only ~30-50 are ever on
       screen. content-visibility defers layout/paint of off-screen cards until
       they near the viewport — they stay in the DOM (queryable, scrollable,
       find-in-page), so behaviour is unchanged but the initial open is cheap.
       The auto intrinsic size remembers each card's real height after first
       paint, keeping scroll height stable. */
    content-visibility: auto;
    contain-intrinsic-size: auto 150px;
  }
  .pcr-atb2-card-mod-dot {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    margin-right: 5px;
    vertical-align: middle;
    flex: 0 0 auto;
    padding: 0;
    cursor: pointer;
    background: #555;
    border: 0;
    transition: filter 0.1s, transform 0.1s, box-shadow 0.1s;
  }
  .pcr-atb2-card-mod-dot.filled {
    border: 1px solid rgba(0, 0, 0, 0.45);
  }
  .pcr-atb2-card-mod-dot.hollow {
    background: transparent;
    border: 2px solid #b59cff;
  }
  .pcr-atb2-card-mod-dot:hover {
    filter: brightness(1.3);
    transform: scale(1.2);
    box-shadow: 0 0 0 2px rgba(181, 156, 255, 0.4);
  }
  .pcr-atb2-card:hover { background: #333; border-color: #444; }
  .pcr-atb2-card.selected {
    border-color: #8b5cf6;
    background: #2c2540;
    box-shadow: 0 0 0 1px #8b5cf6 inset;
  }
  .pcr-atb2-card-thumb {
    aspect-ratio: 1/1;
    border-radius: 4px;
    overflow: hidden;
    position: relative;
  }
  .pcr-atb2-card-thumb img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
  /* Until art lands, an empty thumbnail square is just a black box. Collapse
     it so image-less items render as a compact text chip; cards graduate to
     the full square once a thumb exists (.has-image). */
  .pcr-atb2-card-thumb:not(.has-image) { display: none; }
  .pcr-atb2-card:has(.pcr-atb2-card-thumb:not(.has-image)) { align-self: start; }
  .pcr-atb2-card-name {
    font-size: 12px;
    color: #ddd;
    text-align: center;
    line-height: 1.3;
  }

  /* ---- LIST VIEW ---- compact rows reusing the same card markup: tiny left
     thumb + name (left) + series (right). Toggled via .pcr-atb2-list-mode on
     the browser; works in every view (All / category / NSFW / search / recent). */
  .pcr-atb2-list-mode .pcr-atb2-grid {
    grid-template-columns: 1fr;
    gap: 0;
    padding: 4px 8px;
  }
  .pcr-atb2-list-mode .pcr-atb2-card {
    flex-direction: row;
    align-items: center;
    gap: 10px;
    padding: 5px 8px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    contain-intrinsic-size: auto 34px;
  }
  .pcr-atb2-list-mode .pcr-atb2-card:hover { background: #2a2a2a; border: 0; }
  .pcr-atb2-list-mode .pcr-atb2-card.selected {
    background: #2c2540;
    box-shadow: 0 0 0 1px #8b5cf6 inset;
  }
  /* Consistent 26px left gutter so names line up; transparent when no thumb. */
  .pcr-atb2-list-mode .pcr-atb2-card-thumb { width: 26px; height: 26px; flex: 0 0 26px; }
  .pcr-atb2-list-mode .pcr-atb2-card-thumb:not(.has-image) { display: block; background: transparent; }
  .pcr-atb2-list-mode .pcr-atb2-card-name {
    text-align: left;
    flex: 1 1 auto;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pcr-atb2-list-mode .pcr-atb2-card-group {
    flex: 0 0 auto;
    margin-left: auto;
    padding-left: 10px;
  }
  .pcr-atb2-card-group {
    font-size: 10px;
    color: #666;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .pcr-atb2-empty {
    color: #666;
    text-align: center;
    padding: 60px 20px;
  }
  .pcr-atb2-empty-soft {
    padding: 16px 20px;
    font-style: italic;
    color: #555;
  }
  .pcr-atb2-card-cast { cursor: not-allowed; opacity: 0.7; }

  /* ---- RIGHT: OUTLINE ---- */
  .pcr-atb2-outline {
    background: #181818;
    border-left: 1px solid #333;
    padding: 12px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .pcr-atb2-outline-heading {
    color: #888;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    padding: 4px 4px 6px;
  }

  .pcr-atb2-card2 {
    background: #222;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 10px 12px;
    cursor: pointer;
    transition: border-color 0.12s, box-shadow 0.12s;
  }
  .pcr-atb2-card2.active {
    border-color: var(--subj-color, #8b5cf6);
    box-shadow: 0 0 0 1px var(--subj-color, #8b5cf6);
  }
  .pcr-atb2-scene-card.active {
    border-color: #6a8a3a;
    box-shadow: 0 0 0 1px #6a8a3a;
  }

  .pcr-atb2-card2-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 8px;
    margin-bottom: 6px;
    border-bottom: 1px solid #2c2c2c;
  }
  .pcr-atb2-card2-avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: #4a4a8a;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 19px;
    font-weight: 600;
    color: #fff;
    flex-shrink: 0;
  }
  .pcr-atb2-scene-avatar { background: #6a8a3a; }
  .pcr-atb2-card2-avatar-img {
    background: transparent !important;
    overflow: hidden;
    border: 1.5px solid #555;
    padding: 0;
  }
  .pcr-atb2-card2-avatar-img img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .pcr-atb2-card2-title {
    flex: 1;
    color: #ddd;
    font-size: 13px;
    font-weight: 500;
  }
  .pcr-atb2-card2-tag {
    font-size: 10px;
    color: #888;
    background: #2c2c2c;
    padding: 2px 6px;
    border-radius: 3px;
  }
  .pcr-atb2-card2-delete {
    background: transparent;
    border: none;
    color: #666;
    font-size: 20px;
    line-height: 1;
    padding: 0 4px;
    cursor: pointer;
    border-radius: 3px;
  }
  .pcr-atb2-card2-delete:hover { color: #ff6b6b; background: #3a2222; }

  .pcr-atb2-subject-name {
    flex: 1;
    background: transparent;
    border: 1px solid transparent;
    color: #ddd;
    font-size: 13px;
    font-weight: 500;
    padding: 2px 4px;
    border-radius: 3px;
    min-width: 0;
  }
  .pcr-atb2-subject-name:hover { border-color: #333; }
  .pcr-atb2-subject-name:focus {
    outline: none;
    border-color: var(--subj-color, #8b5cf6);
    background: #1a1a1a;
  }

  .pcr-atb2-subj-section {
    margin-top: 10px;
    border-top: 1px solid #2c2c2c;
    padding-top: 8px;
  }
  /* First section in a card sits flush — no top border above the very first one. */
  .pcr-atb2-card2-header + .pcr-atb2-subj-section {
    border-top: none;
    padding-top: 4px;
    margin-top: 0;
  }
  .pcr-atb2-subj-section-header {
    color: #b8b8b8;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    margin: 0 0 6px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pcr-atb2-subj-section-title { flex: 1; }
  .pcr-atb2-subj-section-header.clickable {
    cursor: pointer;
    user-select: none;
    padding: 2px 0;
    border-radius: 3px;
  }
  .pcr-atb2-subj-section-header.clickable:hover { color: #d4b8ff; }
  .pcr-atb2-section-chev {
    color: #888;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0;
    text-transform: none;
    background: #2a2540;
    color: #b8a3e6;
    padding: 2px 7px;
    border-radius: 10px;
    border: 1px solid #3a3055;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .pcr-atb2-subj-section-header.clickable:hover .pcr-atb2-section-chev {
    background: #3a2a4a;
    color: #e0c8ff;
    border-color: #5a4080;
  }
  .pcr-atb2-subj-empty {
    color: #555;
    font-size: 11px;
    padding: 6px 0;
    font-style: italic;
  }

  .pcr-atb2-slot {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 4px 0;
    font-size: 12px;
  }
  .pcr-atb2-slot-label {
    width: 90px;
    color: #888;
    flex-shrink: 0;
  }
  .pcr-atb2-slot-multi {
    color: #8b5cf6;
    font-size: 9px;
    margin-left: 3px;
    vertical-align: super;
  }
  .pcr-atb2-slot-value {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }
  .pcr-atb2-slot-add {
    color: #555;
    cursor: pointer;
    font-size: 11px;
    padding: 1px 4px;
    border-radius: 3px;
    transition: color 0.12s, background 0.12s;
  }
  .pcr-atb2-slot-add:hover {
    color: #d4b8ff;
    background: #2a2540;
  }

  .pcr-atb2-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #3a2a4a;
    color: #d4b8ff;
    padding: 2px 4px 2px 8px;
    border-radius: 3px;
    font-size: 11px;
    line-height: 1.5;
    transition: filter 0.12s, box-shadow 0.12s;
  }
  .pcr-atb2-chip-jumpable {
    cursor: pointer;
  }
  .pcr-atb2-chip-jumpable:hover {
    filter: brightness(1.25);
    box-shadow: 0 0 0 1px currentColor inset;
  }

  /* Brief highlight on the matching middle-browser card after a chip jump. */
  :global(.pcr-atb2-card.pcr-atb2-flash) {
    animation: pcrAtb2Flash 1s ease-out;
  }
  @keyframes pcrAtb2Flash {
    0%   { box-shadow: 0 0 0 2px #f59e0b, 0 0 12px #f59e0b; }
    100% { box-shadow: 0 0 0 0 transparent, 0 0 0 transparent; }
  }

  /* QA gate: chips actively flagged 'broken' (bad natlang content) get a
     hard red outline + subtle dim. Untested 'unprocessed' chips stay
     neutral so the field isn't a wall of red on first install — red is
     reserved for known problems. Inline box-shadow doubles as the border
     so card sizing stays identical. Dim is shallow so names are still
     readable when fixing the flagged chips. */
  /* QA red-outline + dim markers temporarily disabled. Uncomment to
     re-enable highlighting of chips whose natlang_status != normalized. */
  /*
  .pcr-atb2-card-unprocessed {
    box-shadow: inset 0 0 0 2px #dc2626;
    opacity: 0.6;
  }
  .pcr-atb2-card-unprocessed:hover {
    opacity: 1;
  }
  .pcr-atb2-chip-unprocessed {
    box-shadow: 0 0 0 1.5px #dc2626 inset;
    opacity: 0.7;
  }
  .pcr-atb2-chip-unprocessed:hover {
    opacity: 1;
  }
  */

  /* QA right-click context menu. Click-outside dismissal uses a full-
     viewport transparent overlay so a single click anywhere else closes
     the menu without hijacking the click. */
  .pcr-atb2-qa-overlay {
    position: fixed;
    inset: 0;
    z-index: 9998;
  }
  .pcr-atb2-qa-menu {
    position: fixed;
    z-index: 9999;
    background: #1f1830;
    border: 1px solid #4a3a5a;
    border-radius: 6px;
    padding: 0;
    width: 320px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.55);
    font-size: 12px;
    color: #d4b8ff;
    overflow: hidden;
  }
  .pcr-atb2-qa-menu-title {
    padding: 10px 14px 8px;
    font-size: 13px;
    color: #e6def5;
    font-weight: 600;
    border-bottom: 1px solid #3a2a4a;
    background: #261d3a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pcr-atb2-qa-menu-preview {
    padding: 8px 14px 10px;
    border-bottom: 1px solid #3a2a4a;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pcr-atb2-qa-block {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .pcr-atb2-qa-block-label {
    color: #8a7aa3;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
  }
  .pcr-atb2-qa-block-value {
    color: #e6def5;
    line-height: 1.4;
    overflow-wrap: anywhere;
    word-break: break-word;
    white-space: pre-wrap;
  }
  .pcr-atb2-qa-block-mono {
    font-family: ui-monospace, "Cascadia Code", "SF Mono", Consolas, monospace;
    font-size: 11px;
    color: #c0a8e0;
  }
  .pcr-atb2-qa-menu-actions {
    padding: 4px 0;
  }
  .pcr-atb2-qa-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    background: transparent;
    border: none;
    color: inherit;
    padding: 6px 12px;
    text-align: left;
    cursor: pointer;
    font: inherit;
  }
  .pcr-atb2-qa-menu-item:hover { background: #2a2540; }
  .pcr-atb2-qa-menu-item.current { color: #fff; font-weight: 600; }
  .pcr-atb2-qa-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
  }
  .pcr-atb2-qa-dot-ready       { background: #22c55e; }
  .pcr-atb2-qa-dot-unprocessed { background: #6b7280; }
  .pcr-atb2-qa-dot-broken      { background: #dc2626; }
  .pcr-atb2-chip-x {
    background: transparent;
    border: none;
    color: #a78bda;
    cursor: pointer;
    padding: 0 4px;
    font-size: 14px;
    line-height: 1;
  }
  .pcr-atb2-chip-x:hover { color: #fff; }

  .pcr-atb2-chip-character {
    background: #2a3a4a;
    color: #b8d4ff;
    padding-right: 8px;
  }

  .pcr-atb2-chip-freeform {
    background: #3a3528;
    color: #e6d4a3;
  }

  /* Cap is a small filled circle tinted to the picked color modifier, or
     a hollow ring when only non-color modifiers are set. Sits inline at
     the left of the chip body. */
  .pcr-atb2-chip-cap {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: 0 0 auto;
    vertical-align: middle;
    cursor: pointer;
    transition: filter 0.1s, transform 0.1s;
  }
  .pcr-atb2-chip-cap-filled {
    border: 1px solid rgba(0, 0, 0, 0.45);
  }
  .pcr-atb2-chip-cap-hollow {
    background: transparent;
    border: 2px solid #b59cff;
  }
  .pcr-atb2-chip-cap:hover { filter: brightness(1.25); transform: scale(1.1); }
  .pcr-atb2-chip-body {
    cursor: pointer;
    display: inline-flex;
    align-items: center;
  }
  .pcr-atb2-chip-body:hover { color: #fff; }

  .pcr-atb2-chip-identity {
    background: #2a3a4a;
    color: #b8d4ff;
  }

  .pcr-atb2-chip-modifier {
    background: #2a3528;
    color: #c8e3a0;
  }

  /* ---- MODIFIER PICKER POPOVER ---- */
  :global(.pcr-atb2-modifier-dd) {
    position: fixed;
    z-index: 100050;
    background: #1f1f1f;
    border: 1px solid #444;
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    max-height: 360px;
    min-width: 240px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  :global(.pcr-atb2-modifier-dd-list) {
    overflow-y: auto;
    flex: 1;
    padding: 4px 0;
    scrollbar-width: thin;
    scrollbar-color: #3a3a3a transparent;
  }
  :global(.pcr-atb2-modifier-dd-list::-webkit-scrollbar) { width: 8px; }
  :global(.pcr-atb2-modifier-dd-list::-webkit-scrollbar-thumb) {
    background: #3a3a3a;
    border-radius: 4px;
  }
  :global(.pcr-atb2-modifier-dd-row) {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    cursor: pointer;
    font-size: 12px;
    color: #ccc;
  }
  :global(.pcr-atb2-modifier-dd-row:hover) {
    background: #2a2540;
    color: #fff;
  }
  :global(.pcr-atb2-modifier-dd-row.on) {
    color: #c8e3a0;
  }
  :global(.pcr-atb2-modifier-dd-row.on:hover) {
    background: #2a3528;
  }
  :global(.pcr-atb2-modifier-dd-check) {
    width: 12px;
    color: #c8e3a0;
    font-size: 11px;
    flex-shrink: 0;
  }
  :global(.pcr-atb2-modifier-dd-name) {
    flex: 1;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
  }

  .pcr-atb2-bc-target.rebind strong { color: #f59e0b; }

  /* ---- IDENTITY/PRESET DROPDOWN TRIGGER ---- */
  .pcr-atb2-identity-trigger,
  .pcr-atb2-preset-trigger {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    text-align: left;
    font-family: inherit;
  }
  .pcr-atb2-identity-trigger-label,
  .pcr-atb2-preset-trigger-label {
    flex: 1 1 0;
    min-width: 0;
    width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
  }
  .pcr-atb2-identity-trigger-chev,
  .pcr-atb2-preset-trigger-chev {
    color: #888;
    font-size: 9px;
    flex-shrink: 0;
  }

  /* ---- IDENTITY DROPDOWN POPOVER (fixed-positioned) ---- */
  :global(.pcr-atb2-identity-dd) {
    position: fixed;
    z-index: 100050;
    background: #1f1f1f;
    border: 1px solid #444;
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    display: flex;
    flex-direction: column;
    max-height: 360px;
    min-width: 280px;
    overflow: hidden;
  }
  :global(.pcr-atb2-identity-dd-search) {
    background: #141414;
    color: #ddd;
    border: none;
    border-bottom: 1px solid #444;
    padding: 10px 12px;
    font-size: 13px;
    outline: none;
    font-family: inherit;
  }
  :global(.pcr-atb2-identity-dd-search::placeholder) { color: #777; }
  :global(.pcr-atb2-identity-dd-search:focus) {
    background: #1a1430;
    border-bottom-color: #8b5cf6;
  }
  :global(.pcr-atb2-identity-dd-list) {
    overflow-y: auto;
    flex: 1;
    scrollbar-width: thin;
    scrollbar-color: #3a3a3a transparent;
  }
  :global(.pcr-atb2-identity-dd-list::-webkit-scrollbar) { width: 8px; }
  :global(.pcr-atb2-identity-dd-list::-webkit-scrollbar-thumb) {
    background: #3a3a3a;
    border-radius: 4px;
  }
  :global(.pcr-atb2-identity-dd-row) {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    cursor: pointer;
    font-size: 12px;
    color: #ddd;
  }
  :global(.pcr-atb2-identity-dd-row:hover) {
    background: #2a2540;
    color: #fff;
  }
  :global(.pcr-atb2-identity-dd-name) {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.pcr-atb2-identity-dd-meta) {
    color: #777;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    flex-shrink: 0;
  }
  :global(.pcr-atb2-identity-dd-empty) {
    padding: 16px;
    color: #666;
    text-align: center;
    font-size: 12px;
  }

  /* ---- PRESET DROPDOWN POPOVER (outfit/pose) ---- */
  :global(.pcr-atb2-preset-dd) {
    position: fixed;
    z-index: 100050;
    background: #1f1f1f;
    border: 1px solid #444;
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    display: flex;
    flex-direction: column;
    max-height: 400px;
    min-width: 320px;
    overflow: hidden;
  }
  :global(.pcr-atb2-preset-dd-search) {
    background: #141414;
    color: #ddd;
    border: none;
    border-bottom: 1px solid #444;
    padding: 10px 12px;
    font-size: 13px;
    outline: none;
    font-family: inherit;
  }
  :global(.pcr-atb2-preset-dd-search::placeholder) { color: #777; }
  :global(.pcr-atb2-preset-dd-search:focus) {
    background: #1a1430;
    border-bottom-color: #8b5cf6;
  }
  :global(.pcr-atb2-preset-dd-list) {
    overflow-y: auto;
    flex: 1;
    scrollbar-width: thin;
    scrollbar-color: #3a3a3a transparent;
  }
  :global(.pcr-atb2-preset-dd-list::-webkit-scrollbar) { width: 8px; }
  :global(.pcr-atb2-preset-dd-list::-webkit-scrollbar-thumb) {
    background: #3a3a3a;
    border-radius: 4px;
  }
  :global(.pcr-atb2-preset-dd-row) {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    cursor: pointer;
    font-size: 12px;
    color: #ddd;
  }
  :global(.pcr-atb2-preset-dd-row:hover) {
    background: #2a2540;
    color: #fff;
  }
  :global(.pcr-atb2-preset-dd-row.canonical) {
    background: #1f1d2e;
  }
  :global(.pcr-atb2-preset-dd-row.canonical:hover) {
    background: #2a2540;
  }
  :global(.pcr-atb2-preset-dd-star) {
    color: #f59e0b;
    font-size: 11px;
    flex-shrink: 0;
  }
  :global(.pcr-atb2-preset-dd-name) {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.pcr-atb2-preset-dd-meta) {
    color: #777;
    font-size: 10px;
    flex-shrink: 0;
    max-width: 45%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.pcr-atb2-preset-dd-empty) {
    padding: 16px;
    color: #666;
    text-align: center;
    font-size: 12px;
  }

  /* ---- SWAP CONFIRMATION MODAL ---- */
  :global(.pcr-atb2-modal-backdrop) {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.55);
    z-index: 100060;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  :global(.pcr-atb2-modal) {
    background: #222;
    border: 1px solid #444;
    border-radius: 8px;
    padding: 20px 22px;
    min-width: 360px;
    max-width: 480px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.6);
  }
  :global(.pcr-atb2-modal-title) {
    color: #ddd;
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 10px;
  }
  :global(.pcr-atb2-modal-body) {
    color: #bbb;
    font-size: 13px;
    line-height: 1.5;
  }
  :global(.pcr-atb2-modal-body strong) { color: #d4b8ff; }
  :global(.pcr-atb2-modal-note) {
    margin-top: 8px;
    color: #888;
    font-size: 12px;
  }
  :global(.pcr-atb2-modal-footer) {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }

  .pcr-atb2-preset-row {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }
  .pcr-atb2-preset-select {
    background: #2a2a2a;
    color: #ccc;
    border: 1px solid #444;
    border-radius: 3px;
    padding: 4px 6px;
    font-size: 12px;
    cursor: pointer;
    flex: 1;
    min-width: 0;
    max-width: 100%;
    width: 100%;
    box-sizing: border-box;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pcr-atb2-preset-select:hover { border-color: #666; }
  .pcr-atb2-preset-select:focus { outline: none; border-color: #8b5cf6; }

  .pcr-atb2-preset-clear {
    background: transparent;
    border: 1px solid #333;
    color: #888;
    width: 20px;
    height: 20px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.12s;
  }
  .pcr-atb2-preset-clear:hover {
    border-color: #c0584a;
    color: #ff9b8a;
    background: #3a2222;
  }

  .pcr-atb2-add-subject {
    text-align: center;
    padding: 10px;
    border: 1px dashed #444;
    border-radius: 6px;
    color: #888;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.12s;
  }
  .pcr-atb2-add-subject:hover {
    border-color: #7c3aed;
    color: #d4b8ff;
    background: #1c1828;
  }
  .pcr-atb2-add-scene:hover {
    border-color: #6a8a3a;
    color: #c8e3a0;
    background: #1c241a;
  }
  .pcr-atb2-add-style:hover {
    border-color: #d97706;
    color: #fbbf24;
    background: #1f1810;
  }

  /* Style card is singleton — no .active outline needed.
  .pcr-atb2-style-card.active {
    border-color: #d97706;
    box-shadow: 0 0 0 1px #d97706;
  }
  */
  .pcr-atb2-style-avatar { background: #b45309; }
  .pcr-atb2-style-title {
    cursor: pointer;
  }
  .pcr-atb2-style-title:hover { color: #fbbf24; }
  .pcr-atb2-chip-style {
    background: #3a2a18;
    color: #fbbf24;
  }

  .pcr-atb2-card-style .pcr-atb2-card-name { font-size: 13px; padding: 2px 0; }

  /* ---- FOOTER ---- */
  .pcr-atb2-footer {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    border-top: 1px solid #2a2a2a;
    background: #1a1a1a;
    border-bottom-left-radius: 7px;
    border-bottom-right-radius: 7px;
  }
  .pcr-atb2-footer-spacer { flex: 1; }

  .pcr-atb2-mode-toggle {
    display: inline-flex;
    background: #222;
    border: 1px solid #333;
    border-radius: 6px;
    overflow: hidden;
  }
  .pcr-atb2-mode-option {
    padding: 6px 14px;
    font-size: 12px;
    color: #888;
    cursor: pointer;
    user-select: none;
    transition: all 0.12s;
  }
  .pcr-atb2-mode-option:hover { color: #ccc; background: #2a2a2a; }
  .pcr-atb2-mode-option.active {
    background: #3a2a4a;
    color: #d4b8ff;
  }

  .pcr-atb2-nsfw-toggle {
    background: #222;
    border: 1px solid #333;
    border-radius: 6px;
    color: #888;
    font-size: 12px;
    padding: 6px 12px;
    cursor: pointer;
    user-select: none;
    transition: all 0.12s;
  }
  .pcr-atb2-nsfw-toggle:hover { color: #ccc; border-color: #555; }
  .pcr-atb2-nsfw-toggle.active {
    background: #3a2a4a;
    border-color: #5a4a6a;
    color: #d4b8ff;
  }

  .pcr-atb2-btn {
    padding: 7px 16px;
    border-radius: 5px;
    font-size: 12px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.12s;
  }
  .pcr-atb2-btn-cancel {
    background: transparent;
    border-color: #444;
    color: #aaa;
  }
  .pcr-atb2-btn-cancel:hover { border-color: #666; color: #ddd; }
  .pcr-atb2-btn-insert {
    background: #7c3aed;
    color: #fff;
    border-color: #7c3aed;
    font-weight: 500;
  }
  .pcr-atb2-btn-insert:hover:not(:disabled) { background: #8b5cf6; border-color: #8b5cf6; }
  .pcr-atb2-btn-insert:disabled {
    background: #2a2a2a;
    border-color: #333;
    color: #555;
    cursor: not-allowed;
  }
</style>
