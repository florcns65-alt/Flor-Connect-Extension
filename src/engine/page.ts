/** DOM scan and fill. Helpers stay inside the exported functions so Chrome can inject them. */

export interface ScannedControl {
  frameId: number;
  id: string;
  name: string;
  label: string;
  tag: "input" | "textarea" | "select" | "radio";
  inputType: string;
  currentValue: string;
  empty: boolean;
  options: string[];
}

export interface FillInstruction {
  id: string;
  name: string;
  label: string;
  tag: ScannedControl["tag"];
  value: string;
}

export interface FillWriteResult {
  id: string;
  name: string;
  label: string;
  previousValue: string;
  writtenValue: string;
  readBack: string;
  changed: boolean;
}

export function scanDocument(doc?: Document, frameId = 0): ScannedControl[] {
  const normalizeSpace = (value: string): string => value.replace(/\s+/g, " ").trim();
  const root = doc ?? document;
  const controls: ScannedControl[] = [];
  const seenRadios = new Set<string>();

  const labelText = (element: Element): string => {
    const id = element.getAttribute("id");
    if (id) {
      const explicit = root.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (explicit?.textContent) return normalizeSpace(explicit.textContent);
    }
    const wrapping = element.closest("label");
    if (wrapping?.textContent) return normalizeSpace(wrapping.textContent);
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((token) => root.getElementById(token)?.textContent ?? "")
        .join(" ");
      if (normalizeSpace(text)) return normalizeSpace(text);
    }
    const aria = element.getAttribute("aria-label");
    if (aria) return normalizeSpace(aria);
    const placeholder = element.getAttribute("placeholder");
    if (placeholder) return normalizeSpace(placeholder);
    const cell = element.closest("td, dd");
    const previous = cell?.previousElementSibling;
    if (previous?.textContent && normalizeSpace(previous.textContent)) return normalizeSpace(previous.textContent);
    const sibling = element.parentElement?.previousElementSibling;
    if (sibling?.textContent && normalizeSpace(sibling.textContent)) return normalizeSpace(sibling.textContent);
    return "";
  };

  const blocked = (element: Element): boolean => {
    if (element.hasAttribute("disabled") || element.hasAttribute("readonly")) return true;
    if (element.closest("[hidden]")) return true;
    const ariaHidden = element.closest("[aria-hidden='true']");
    if (ariaHidden) return true;
    const type = (element.getAttribute("type") || "").toLowerCase();
    if (["hidden", "password", "file", "submit", "button", "reset", "image"].includes(type)) return true;
    const hint = `${element.getAttribute("name") ?? ""} ${element.getAttribute("id") ?? ""} ${element.getAttribute("autocomplete") ?? ""} ${labelText(element)}`.toLowerCase();
    if (/password|passwd|otp|one-time|cvv|cvc|card.?number|credit.?card|payment|routing|ssn|social security|account number/.test(hint)) return true;
    const view = element.ownerDocument.defaultView;
    if (view) {
      const style = view.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return true;
    }
    return false;
  };

  const walk = (scope: ParentNode) => {
    scope.querySelectorAll("input, textarea, select").forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      const element = node;
      if (blocked(element)) return;
      const type = (element.getAttribute("type") || (element instanceof HTMLSelectElement ? "select" : "text")).toLowerCase();
      if (type === "radio") {
        const name = element.getAttribute("name") || element.getAttribute("id") || "";
        if (!name || seenRadios.has(name)) return;
        seenRadios.add(name);
        const group = [...scope.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`)].filter((item) => !blocked(item));
        const checked = group.find((item) => (item as HTMLInputElement).checked) as HTMLInputElement | undefined;
        const current = checked ? labelText(checked) || checked.value : "";
        controls.push({
          frameId,
          id: checked?.id || group[0]?.id || "",
          name,
          label: labelText(element) || name,
          tag: "radio",
          inputType: "radio",
          currentValue: normalizeSpace(current),
          empty: !normalizeSpace(current),
          options: group.map((item) => normalizeSpace(labelText(item) || (item as HTMLInputElement).value)),
        });
        return;
      }
      if (type === "checkbox") return;
      const input = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      let current = "";
      let options: string[] = [];
      if (input instanceof HTMLSelectElement) {
        current = input.selectedOptions[0]?.text ?? input.value;
        options = [...input.options].map((option) => normalizeSpace(option.text || option.value));
      } else {
        current = input.value;
      }
      const tag = input instanceof HTMLTextAreaElement ? "textarea" : input instanceof HTMLSelectElement ? "select" : "input";
      controls.push({
        frameId,
        id: input.id || "",
        name: input.getAttribute("name") || "",
        label: labelText(input),
        tag,
        inputType: input instanceof HTMLSelectElement ? "select" : type || "text",
        currentValue: normalizeSpace(current),
        empty: !normalizeSpace(current),
        options,
      });
    });
    scope.querySelectorAll("*").forEach((element) => {
      if (element.shadowRoot) walk(element.shadowRoot);
    });
  };

  walk(root);
  return controls;
}

export function fillDocument(doc: Document | undefined, instructions: FillInstruction[]): FillWriteResult[] {
  const normalizeSpace = (value: string): string => value.replace(/\s+/g, " ").trim();
  const root = doc ?? document;

  const findControl = (instruction: FillInstruction): HTMLElement | null => {
    if (instruction.id) {
      const byId = root.getElementById(instruction.id);
      if (byId instanceof HTMLElement) return byId;
    }
    if (!instruction.name) return null;
    const named = [...root.querySelectorAll(`[name="${CSS.escape(instruction.name)}"]`)];
    return (named.find((node) => node instanceof HTMLElement) as HTMLElement | undefined) ?? null;
  };
  const dispatchInput = (element: HTMLElement) => {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  };
  const setTextValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    dispatchInput(element);
  };
  const readControlValue = (element: HTMLElement | null): string => {
    if (!element) return "";
    if (element instanceof HTMLSelectElement) return normalizeSpace(element.selectedOptions[0]?.text || element.value);
    if (element instanceof HTMLInputElement && element.type === "radio") {
      const group = root.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`);
      const checked = [...group].find((item) => (item as HTMLInputElement).checked) as HTMLInputElement | undefined;
      return normalizeSpace(checked?.labels?.[0]?.textContent || checked?.value || "");
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return normalizeSpace(element.value);
    return "";
  };
  const valuesAgree = (expected: string, actual: string, iso: (value: string) => string): boolean => {
    const left = normalizeSpace(expected).toLowerCase();
    const right = normalizeSpace(actual).toLowerCase();
    if (!right) return false;
    if (left === right || right === iso(expected)) return true;
    return (left === "female" && right === "f") || (left === "male" && right === "m");
  };
  const toIsoDate = (value: string): string => {
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const named = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(value.trim());
    if (!named) return "";
    const month = months.indexOf(named[2].slice(0, 3).toLowerCase());
    if (month < 0) return "";
    return `${named[3]}-${String(month + 1).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
  };

  return instructions.map((instruction) => {
    const element = findControl(instruction);
    const previous = readControlValue(element);
    if (!element) {
      return { id: instruction.id, name: instruction.name, label: instruction.label, previousValue: previous, writtenValue: instruction.value, readBack: "", changed: false };
    }
    if (instruction.tag === "select" && element instanceof HTMLSelectElement) {
      const target = instruction.value.trim().toLowerCase();
      const option = [...element.options].find((item) => {
        const text = item.text.trim().toLowerCase();
        const value = item.value.trim().toLowerCase();
        if (text === target || value === target) return true;
        if (text.length === 1 && target.startsWith(text)) return true;
        if (value.length === 1 && target.startsWith(value)) return true;
        return false;
      });
      if (option) {
        element.value = option.value;
        dispatchInput(element);
      }
    } else if (instruction.tag === "radio") {
      const target = instruction.value.trim().toLowerCase();
      const group = [...root.querySelectorAll(`input[type="radio"][name="${CSS.escape(instruction.name)}"]`)] as HTMLInputElement[];
      const match = group.find((item) => {
        const label = item.labels?.[0]?.textContent?.trim().toLowerCase() || item.value.trim().toLowerCase();
        return label === target || item.value.trim().toLowerCase() === target;
      });
      if (match) {
        match.checked = true;
        dispatchInput(match);
      }
    } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const next = element instanceof HTMLInputElement && element.type === "date" ? toIsoDate(instruction.value) || instruction.value : instruction.value;
      setTextValue(element, next);
    }
    const readBack = readControlValue(findControl(instruction));
    return {
      id: instruction.id,
      name: instruction.name,
      label: instruction.label,
      previousValue: previous,
      writtenValue: instruction.value,
      readBack,
      changed: valuesAgree(instruction.value, readBack, toIsoDate),
    };
  });
}

export function readablePageLabel(url: string, title: string): { host: string; title: string } {
  try {
    const parsed = new URL(url);
    return { host: parsed.host, title: title || parsed.pathname };
  } catch {
    return { host: "", title };
  }
}
