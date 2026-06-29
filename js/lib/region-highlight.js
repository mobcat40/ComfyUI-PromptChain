// $region highlight — colors `$name { ... }` markers (regional-conditioning blocks)
// so it's visually obvious they pin a section to a mannequin. Self-contained CM6
// extension, no node/app imports. The close brace is matched by DEPTH so a
// wildcard/alternation brace ({a|b}) inside a body isn't mistaken for the region
// close, and the opener allows any \w+ name to match the binding/compiler rule.

export function regionHighlightExtension(CM) {
  const nameDeco = CM.Decoration.mark({ class: "pcr-region-name" });
  const braceDeco = CM.Decoration.mark({ class: "pcr-region-brace" });
  const OPEN = /\$\w+\s*\{/g;

  const build = (view) => {
    const ranges = [];
    const text = view.state.doc.toString();
    let m;
    OPEN.lastIndex = 0;
    while ((m = OPEN.exec(text)) !== null) {
      const nameLen = m[0].match(/^\$\w+/)[0].length;
      ranges.push(nameDeco.range(m.index, m.index + nameLen)); // $name
      const open = m.index + m[0].length - 1;
      ranges.push(braceDeco.range(open, open + 1)); // {
      // Depth-track to the matching close (mirrors the binding parser) so nested
      // wildcard braces in the body don't steal the region-close decoration.
      let depth = 1, i = open + 1;
      for (; i < text.length && depth > 0; i++) {
        const c = text[i];
        if (c === "{") depth++;
        else if (c === "}") depth--;
      }
      if (depth === 0) {
        ranges.push(braceDeco.range(i - 1, i)); // }
        OPEN.lastIndex = i; // resume past this region; its body never holds another opener
      }
    }
    ranges.sort((a, b) => a.from - b.from);
    return CM.Decoration.set(ranges, true);
  };

  const plugin = CM.ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = build(view); }
    update(u) { if (u.docChanged || u.viewportChanged) this.decorations = build(u.view); }
  }, { decorations: (v) => v.decorations });

  return [plugin];
}
