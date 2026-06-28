import { _ as component_context, a0 as lifecycle_outside_component, u as user_effect, E as untrack } from "./disclose-version-et9wt-4m.js";
function onMount(fn) {
  if (component_context === null) {
    lifecycle_outside_component();
  }
  {
    user_effect(() => {
      const cleanup = untrack(fn);
      if (typeof cleanup === "function") return (
        /** @type {() => void} */
        cleanup
      );
    });
  }
}
function onDestroy(fn) {
  if (component_context === null) {
    lifecycle_outside_component();
  }
  onMount(() => () => untrack(fn));
}
export {
  onMount as a,
  onDestroy as o
};
//# sourceMappingURL=index-client-6amB1qrM.js.map
