import { a2 as listen_to_event_and_reset_event, a3 as current_batch, C as tick, E as untrack, a9 as render_effect, a7 as is, a8 as teardown, ad as queue_micro_task } from "./disclose-version-et9wt-4m.js";
function bind_value(input, get, set = get) {
  var batches = /* @__PURE__ */ new WeakSet();
  listen_to_event_and_reset_event(input, "input", async (is_reset) => {
    var value = is_reset ? input.defaultValue : input.value;
    value = is_numberlike_input(input) ? to_number(value) : value;
    set(value);
    if (current_batch !== null) {
      batches.add(current_batch);
    }
    await tick();
    if (value !== (value = get())) {
      var start = input.selectionStart;
      var end = input.selectionEnd;
      var length = input.value.length;
      input.value = value ?? "";
      if (end !== null) {
        var new_length = input.value.length;
        if (start === end && end === length && new_length > length) {
          input.selectionStart = new_length;
          input.selectionEnd = new_length;
        } else {
          input.selectionStart = start;
          input.selectionEnd = Math.min(end, new_length);
        }
      }
    }
  });
  if (
    // If we are hydrating and the value has since changed,
    // then use the updated value from the input instead.
    // If defaultValue is set, then value == defaultValue
    // TODO Svelte 6: remove input.value check and set to empty string?
    untrack(get) == null && input.value
  ) {
    set(is_numberlike_input(input) ? to_number(input.value) : input.value);
    if (current_batch !== null) {
      batches.add(current_batch);
    }
  }
  render_effect(() => {
    var value = get();
    if (input === document.activeElement) {
      var batch = (
        /** @type {Batch} */
        current_batch
      );
      if (batches.has(batch)) {
        return;
      }
    }
    if (is_numberlike_input(input) && value === to_number(input.value)) {
      return;
    }
    if (input.type === "date" && !value && !input.value) {
      return;
    }
    if (value !== input.value) {
      input.value = value ?? "";
    }
  });
}
const pending = /* @__PURE__ */ new Set();
function bind_group(inputs, group_index, input, get, set = get) {
  var is_checkbox = input.getAttribute("type") === "checkbox";
  var binding_group = inputs;
  if (group_index !== null) {
    for (var index of group_index) {
      binding_group = binding_group[index] ?? (binding_group[index] = []);
    }
  }
  binding_group.push(input);
  listen_to_event_and_reset_event(
    input,
    "change",
    () => {
      var value = input.__value;
      if (is_checkbox) {
        value = get_binding_group_value(binding_group, value, input.checked);
      }
      set(value);
    },
    // TODO better default value handling
    () => set(is_checkbox ? [] : null)
  );
  render_effect(() => {
    var value = get();
    if (is_checkbox) {
      value = value || [];
      input.checked = value.includes(input.__value);
    } else {
      input.checked = is(input.__value, value);
    }
  });
  teardown(() => {
    var index2 = binding_group.indexOf(input);
    if (index2 !== -1) {
      binding_group.splice(index2, 1);
    }
  });
  if (!pending.has(binding_group)) {
    pending.add(binding_group);
    queue_micro_task(() => {
      binding_group.sort((a, b) => a.compareDocumentPosition(b) === 4 ? -1 : 1);
      pending.delete(binding_group);
    });
  }
  queue_micro_task(() => {
  });
}
function bind_checked(input, get, set = get) {
  listen_to_event_and_reset_event(input, "change", (is_reset) => {
    var value = is_reset ? input.defaultChecked : input.checked;
    set(value);
  });
  if (
    // If we are hydrating and the value has since changed,
    // then use the update value from the input instead.
    // If defaultChecked is set, then checked == defaultChecked
    untrack(get) == null
  ) {
    set(input.checked);
  }
  render_effect(() => {
    var value = get();
    input.checked = Boolean(value);
  });
}
function get_binding_group_value(group, __value, checked) {
  var value = /* @__PURE__ */ new Set();
  for (var i = 0; i < group.length; i += 1) {
    if (group[i].checked) {
      value.add(group[i].__value);
    }
  }
  if (!checked) {
    value.delete(__value);
  }
  return Array.from(value);
}
function is_numberlike_input(input) {
  var type = input.type;
  return type === "number" || type === "range";
}
function to_number(value) {
  return value === "" ? null : +value;
}
export {
  bind_checked as a,
  bind_value as b,
  bind_group as c
};
//# sourceMappingURL=input-B9kD0bWJ.js.map
