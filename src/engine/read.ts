/** Page reader and field picker. Injected functions keep their helpers inside the function body. */

export interface PageFact {
  regionId: string;
  frameId: number;
  label: string;
  value: string;
  writable: boolean;
  controlId: string;
  controlName: string;
  tag: "input" | "textarea" | "select" | "radio" | "text";
  inputType: string;
  evidenceKind: "label" | "aria-label" | "aria-labelledby" | "autocomplete" | "placeholder" | "heading" | "dt" | "th" | "name";
  evidenceText: string;
}

export interface PageRead {
  facts: PageFact[];
  closedControls: number;
  unlabeledControls: number;
  frameId: number;
  host: string;
  path: string;
  build: string;
}

export interface FieldPick {
  regionId: string;
  label: string;
  value: string;
  controlId: string;
  controlName: string;
  writable: boolean;
  evidenceKind: PageFact["evidenceKind"];
  evidenceText: string;
}

export function readDocument(doc?: Document, frameId = 0): PageRead {
  const plain = (value: string): string => [...value].map((char) => (char < " " || char === "<" || char === ">" ? " " : char)).join("").replace(/\s+/g, " ").trim().slice(0, 180);
  const root = doc ?? document;
  const facts: PageFact[] = [];
  let closedControls = 0;
  let unlabeledControls = 0;
  const seen = new Set<string>();
  const tidyLabel = (value: string): string => plain(value).replace(/:$/, "").replace(/\s*\([^)]*\)\s*$/g, "").trim();

  const regionOf = (element: Element): string => {
    const region = element.closest("tr, li, fieldset, section, article, [data-patient]");
    if (!region || region === root.documentElement) return "page";
    if (region.id) return `${region.tagName.toLowerCase()}#${region.id}`;
    const parent = region.parentElement;
    const siblings = parent ? [...parent.children].filter((child) => child.tagName === region.tagName) : [region];
    const index = Math.max(0, siblings.indexOf(region as Element));
    const parentKey = parent?.id ? `${parent.tagName.toLowerCase()}#${parent.id}` : parent?.tagName.toLowerCase() || "root";
    return `${parentKey}>${region.tagName.toLowerCase()}:${index}`;
  };

  const pushFact = (fact: PageFact) => {
    const label = plain(fact.label).replace(/:$/, "");
    const value = plain(fact.value);
    if (!label || label.length > 40) return;
    if (!value && !fact.writable) return;
    const key = `${fact.regionId}|${label.toLowerCase()}|${fact.controlId}|${fact.controlName}`;
    if (seen.has(key)) return;
    seen.add(key);
    facts.push({ ...fact, label, value, evidenceText: plain(fact.evidenceText) || label });
  };

  const labelFor = (element: Element): { text: string; kind: PageFact["evidenceKind"] } => {
    const owner = element.getRootNode();
    const scope: ParentNode & { getElementById?: (id: string) => HTMLElement | null } = owner instanceof Document || owner instanceof ShadowRoot ? owner : root;
    const id = element.getAttribute("id");
    if (id) {
      const explicit = scope.querySelector(`label[for="${CSS.escape(id)}"]`);
      const text = plain(explicit?.textContent ?? "");
      if (text) return { text, kind: "label" };
    }
    const wrapping = element.closest("label");
    const wrapped = plain(wrapping?.textContent ?? "");
    if (wrapped) return { text: wrapped, kind: "label" };
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = plain(labelledBy.split(/\s+/).map((token) => scope.querySelector(`#${CSS.escape(token)}`)?.textContent ?? "").join(" "));
      if (text) return { text, kind: "aria-labelledby" };
    }
    const aria = plain(element.getAttribute("aria-label") ?? "");
    if (aria) return { text: aria, kind: "aria-label" };
    const auto = plain(element.getAttribute("autocomplete") ?? "");
    if (auto && auto !== "off" && auto !== "on") return { text: auto, kind: "autocomplete" };
    const placeholder = plain(element.getAttribute("placeholder") ?? "");
    if (placeholder) return { text: placeholder, kind: "placeholder" };
    let sibling: Element | null = element.previousElementSibling;
    while (sibling) {
      const text = tidyLabel(sibling.textContent ?? "");
      if (text && text.length <= 40 && !sibling.querySelector("input, textarea, select")) return { text, kind: "label" };
      sibling = sibling.previousElementSibling;
    }
    const parentLabel = element.parentElement?.querySelector(":scope > label");
    const parentText = tidyLabel(parentLabel?.textContent ?? "");
    if (parentText && parentText.length <= 40) return { text: parentText, kind: "label" };
    const cell = element.closest("td, dd");
    const previous = cell?.previousElementSibling;
    const beside = plain(previous?.textContent ?? "");
    if (beside) return { text: beside, kind: "label" };
    return { text: "", kind: "name" };
  };

  const blockedSecret = (element: Element, label: string): boolean => {
    const hint = `${element.getAttribute("name") ?? ""} ${element.getAttribute("id") ?? ""} ${element.getAttribute("autocomplete") ?? ""} ${label}`.toLowerCase();
    return /password|passwd|otp|one-time|cvv|cvc|card.?number|credit.?card|payment|routing|ssn|social security|account number/.test(hint);
  };

  const walkControls = (scope: ParentNode) => {
    scope.querySelectorAll("input, textarea, select").forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      const type = (node.getAttribute("type") || "").toLowerCase();
      if (["hidden", "password", "file", "submit", "button", "reset", "image", "checkbox"].includes(type)) return;
      const labelled = labelFor(node);
      labelled.text = tidyLabel(labelled.text);
      if (blockedSecret(node, labelled.text) || /ssn|social security|s\.s\./i.test(labelled.text)) return;
      if (node.hasAttribute("disabled") || node.hasAttribute("readonly")) {
        closedControls += 1;
        return;
      }
      if (!labelled.text) {
        unlabeledControls += 1;
        return;
      }
      const view = node.ownerDocument.defaultView;
      if (view) {
        const style = view.getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") return;
      }
      if (type === "radio") {
        const name = node.getAttribute("name") || "";
        if (!name || facts.some((fact) => fact.controlName === name && fact.tag === "radio")) return;
        const group = [...scope.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`)] as HTMLInputElement[];
        const checked = group.find((item) => item.checked);
        pushFact({
          regionId: regionOf(node),
          frameId,
          label: labelled.text || name,
          value: plain(checked?.value || ""),
          writable: true,
          controlId: checked?.id || node.id || "",
          controlName: name,
          tag: "radio",
          inputType: "radio",
          evidenceKind: labelled.kind,
          evidenceText: labelled.text || name,
        });
        return;
      }
      let value = "";
      if (node instanceof HTMLSelectElement) value = node.selectedOptions[0]?.text || node.value;
      else if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) value = node.value;
      const tag = node instanceof HTMLTextAreaElement ? "textarea" : node instanceof HTMLSelectElement ? "select" : "input";
      pushFact({
        regionId: regionOf(node),
        frameId,
        label: labelled.text || node.getAttribute("name") || node.id,
        value,
        writable: true,
        controlId: node.id || "",
        controlName: node.getAttribute("name") || "",
        tag,
        inputType: node instanceof HTMLSelectElement ? "select" : type || "text",
        evidenceKind: labelled.kind,
        evidenceText: labelled.text,
      });
    });
    scope.querySelectorAll("*").forEach((element) => {
      if (element.shadowRoot) walkControls(element.shadowRoot);
    });
  };

  const addPair = (element: Element, label: string, value: string, kind: PageFact["evidenceKind"]) => {
    if (element.closest("input, textarea, select, script, style")) return;
    pushFact({
      regionId: regionOf(element),
      frameId,
      label,
      value,
      writable: false,
      controlId: "",
      controlName: "",
      tag: "text",
      inputType: "text",
      evidenceKind: kind,
      evidenceText: label,
    });
  };

  root.querySelectorAll("dt").forEach((term) => {
    const value = term.nextElementSibling;
    if (value?.tagName === "DD") addPair(value, term.textContent ?? "", value.textContent ?? "", "dt");
  });
  root.querySelectorAll("table").forEach((table) => {
    const rows = [...table.querySelectorAll("tr")];
    const headerRow = rows.find((row) => row.querySelector("th"));
    const headers = headerRow ? [...headerRow.children].map((cell) => plain(cell.textContent ?? "")) : [];
    rows.forEach((row) => {
      if (row === headerRow) return;
      const cells = [...row.children];
      if (headers.length > 0) {
        cells.forEach((cell, index) => addPair(cell, headers[index] ?? "", cell.textContent ?? "", "th"));
        return;
      }
      if (cells.length === 2) addPair(cells[1], cells[0].textContent ?? "", cells[1].textContent ?? "", "th");
      if (cells.length >= 3 && /^name$/i.test(tidyLabel(cells[0].textContent ?? ""))) {
        addPair(cells[1], "Given", cells[1].textContent ?? "", "th");
        addPair(cells[2], "Family Name", cells[2].textContent ?? "", "th");
      }
    });
  });
  root.querySelectorAll("h2, h3, h4").forEach((heading) => {
    const next = heading.nextElementSibling;
    if (!next) return;
    if (next.querySelector("input, textarea, select, table, dl, p, div")) return;
    addPair(next, heading.textContent ?? "", next.textContent ?? "", "heading");
  });
  const banner = root.querySelector("h1");
  if (banner) {
    const bannerName = tidyLabel(banner.textContent ?? "").replace(/\s*\(\d+\)\s*$/, "");
    const words = bannerName.split(/\s+/).filter(Boolean);
    const nameLike = words.length >= 2 && words.length <= 4 && words.every((word) => /^[\p{L}][\p{L}'.-]*$/u.test(word));
    const parent = banner.parentElement;
    const parentText = plain(parent?.textContent ?? "");
    const around = parent && parent !== root.body && parentText.length > 0 && parentText.length < 240
      ? parent.textContent ?? ""
      : `${banner.nextElementSibling?.textContent ?? ""} ${banner.nextElementSibling?.nextElementSibling?.textContent ?? ""}`;
    const dated = around.match(/(\d{4}-\d{2}-\d{2})|(\d{1,2})[.\s]([A-Za-z]{3,})[.\s](\d{4})/);
    if (nameLike) addPair(banner, "Name", bannerName, "heading");
    if (dated) {
      const dob = dated[1] || `${dated[2]} ${dated[3]} ${dated[4]}`;
      addPair(banner, "DOB", dob, "heading");
    }
  }
  root.querySelectorAll("span, div, p, label").forEach((element) => {
    if (element.children.length > 0) return;
    const label = tidyLabel(element.textContent ?? "");
    const next = element.nextElementSibling;
    if (!next || next.children.length > 0) return;
    if (!/^(name|patient|first name|given|given name|last name|family name|surname|dob|date of birth|birthdate|birth date|sex|gender|birth sex|mrn|external id|home phone|phone|email)$/i.test(label)) return;
    addPair(next, label, next.textContent ?? "", "label");
  });

  walkControls(root);
  let host = "";
  let path = "";
  try {
    host = root.location.host;
    path = root.location.pathname;
  } catch {
    host = "";
    path = "";
  }
  return { facts, closedControls, unlabeledControls, frameId, host, path, build: "2.5.0" };
}

export function mergeReads(parts: Array<PageRead | null>): { facts: PageFact[]; frameErrors: number; closedControls: number; unlabeledControls: number } {
  const facts: PageFact[] = [];
  let frameErrors = 0;
  let closedControls = 0;
  for (const part of parts) {
    if (!part) {
      frameErrors += 1;
      continue;
    }
    closedControls += part.closedControls;
    facts.push(...part.facts);
  }
  return { facts, frameErrors, closedControls, unlabeledControls: parts.reduce((sum, part) => sum + (part?.unlabeledControls ?? 0), 0) };
}

export function installFieldPicker(doc?: Document): void {
  const root = doc ?? document;
  const view = root.defaultView as (Window & { __florPicker?: PickerBindings; __florPicked?: FieldPick | null }) | null;
  if (!view) return;
  cancelFieldPicker(root);
  const plain = (value: string): string => [...value].map((char) => (char < " " || char === "<" || char === ">" ? " " : char)).join("").replace(/\s+/g, " ").trim().slice(0, 180);
  const regionOf = (element: Element): string => {
    const region = element.closest("tr, li, fieldset, section, article, [data-patient]");
    if (!region) return "page";
    if (region.id) return `${region.tagName.toLowerCase()}#${region.id}`;
    const parent = region.parentElement;
    const siblings = parent ? [...parent.children].filter((child) => child.tagName === region.tagName) : [region];
    const parentKey = parent?.id ? `${parent.tagName.toLowerCase()}#${parent.id}` : parent?.tagName.toLowerCase() || "root";
    return `${parentKey}>${region.tagName.toLowerCase()}:${Math.max(0, siblings.indexOf(region))}`;
  };
  const describe = (target: Element): FieldPick => {
    const control = target.closest("input, textarea, select, dd, td, p, span, div");
    const element = control ?? target;
    let label = "";
    let value = "";
    let controlId = "";
    let controlName = "";
    let writable = false;
    let evidenceKind: FieldPick["evidenceKind"] = "label";
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      writable = !element.hasAttribute("disabled") && !element.hasAttribute("readonly");
      controlId = element.id || "";
      controlName = element.getAttribute("name") || "";
      value = element instanceof HTMLSelectElement ? element.selectedOptions[0]?.text || element.value : element.value;
      const id = element.id;
      const explicit = id ? root.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      label = explicit?.textContent || element.getAttribute("aria-label") || element.getAttribute("placeholder") || controlName;
      evidenceKind = explicit ? "label" : element.getAttribute("aria-label") ? "aria-label" : "name";
    } else {
      const previous = element.previousElementSibling;
      label = previous?.textContent || element.getAttribute("aria-label") || "";
      value = element.textContent ?? "";
      evidenceKind = previous?.tagName === "DT" ? "dt" : previous?.tagName === "TH" ? "th" : "label";
    }
    return {
      regionId: regionOf(element),
      label: plain(label).replace(/:$/, ""),
      value: plain(value),
      controlId,
      controlName,
      writable,
      evidenceKind,
      evidenceText: plain(label),
    };
  };
  let hovered: Element | null = null;
  const onMove = (event: Event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (hovered && hovered !== target) hovered.removeAttribute("data-flor-hover");
    hovered = target;
    target?.setAttribute("data-flor-hover", "true");
  };
  const onClick = (event: Event) => {
    if (!(event.target instanceof Element)) return;
    event.preventDefault();
    event.stopPropagation();
    view.__florPicked = describe(event.target);
  };
  const onKey = (event: Event) => {
    if (event instanceof KeyboardEvent && event.key === "Escape") cancelFieldPicker(root);
  };
  root.addEventListener("mousemove", onMove, true);
  root.addEventListener("click", onClick, true);
  view.addEventListener("keydown", onKey, true);
  const style = root.createElement("style");
  style.id = "flor-pick-style";
  style.textContent = "[data-flor-hover]{outline:2px solid #1f6f5b}";
  root.documentElement.append(style);
  view.__florPicker = { onMove, onClick, onKey };
}

interface PickerBindings {
  onMove: (event: Event) => void;
  onClick: (event: Event) => void;
  onKey: (event: Event) => void;
}

export function cancelFieldPicker(doc?: Document): void {
  const root = doc ?? document;
  const view = root.defaultView as (Window & { __florPicker?: PickerBindings; __florPicked?: FieldPick | null }) | null;
  const state = view?.__florPicker;
  if (state && view) {
    root.removeEventListener("mousemove", state.onMove, true);
    root.removeEventListener("click", state.onClick, true);
    view.removeEventListener("keydown", state.onKey, true);
    view.__florPicker = undefined;
  }
  root.getElementById("flor-pick-style")?.remove();
  root.querySelectorAll("[data-flor-hover]").forEach((element) => element.removeAttribute("data-flor-hover"));
}

export function takeFieldPick(doc?: Document): FieldPick | null {
  const view = (doc ?? document).defaultView as (Window & { __florPicked?: FieldPick | null }) | null;
  const pick = view?.__florPicked ?? null;
  if (view) view.__florPicked = null;
  return pick;
}
