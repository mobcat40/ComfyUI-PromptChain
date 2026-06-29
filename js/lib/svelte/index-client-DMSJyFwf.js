import { a0 as component_context, a1 as lifecycle_outside_component, u as user_effect, E as untrack } from "./disclose-version-CPcS7M7Y.js";
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
//# sourceMappingURL=index-client-DMSJyFwf.js.map
