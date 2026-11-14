import { MODULE_ID } from "../constants.mjs";

export const SPELL_INFORMATION = "spellcastingInformationIcons";
export function registerSpellInformationSetting(settings, onChange) {
  settings.register(MODULE_ID, SPELL_INFORMATION, {
    name: "PATCHWORK.Spells.Name", hint: "PATCHWORK.Spells.Hint",
    scope: "client", config: false, type: Boolean, default: false,
    requiresReload: false, onChange
  });
}

const SAVES = { fortitude: "Fortitude", reflex: "Reflex", will: "Will" };
const SAVE_SHORT = { fortitude: "Fort", reflex: "Ref", will: "Will" };
const SHAPES = { burst: ["Burst", "radius", "burst"], cone: ["Cone", "length", "play"],
  line: ["Line", "length", "arrows-left-right"], emanation: ["Emanation", "radius", "circle-dot"] };

/** Classify only structured, prepared PF2e spell data, including a resolved variant. */
export function classifySpell(spell, localize = (_key, fallback) => fallback) {
  if (spell?.type !== "spell" || !spell.system) return [];
  const result = [];
  const defense = spell.system.defense;
  // A passive Fortitude/Reflex/Will DC is not an attack against AC.
  if (defense?.passive?.statistic === "ac" && spell.isAttack === true) {
    result.push({ kind: "attack", icon: "crosshairs", label: localize("Attack", "Spell attack against AC") });
  }
  const save = defense?.save;
  if (SAVES[save?.statistic]) {
    const name = localize(SAVES[save.statistic], SAVES[save.statistic]);
    const short = localize(`${SAVES[save.statistic]}Short`, SAVE_SHORT[save.statistic]);
    result.push({ kind: "save", icon: save.basic ? "shield-halved" : "shield", basic: save.basic === true,
      text: `${save.basic ? "B " : ""}${short}`,
      label: `${localize(save.basic ? "BasicSave" : "Save", save.basic ? "Basic save" : "Saving throw")}: ${name}` });
  }
  const area = spell.system.area;
  const shape = SHAPES[area?.type];
  if (shape && Number.isFinite(area.value) && area.value > 0) {
    result.push({ kind: area.type, icon: shape[2],
      label: `${localize(shape[0], shape[0])}: ${area.value} ${localize("Feet", "ft")}` +
        ` ${localize(shape[1], shape[1])}${area.details ? ` (${area.details})` : ""}` });
  }
  const range = typeof spell.system.range?.value === "string" ? spell.system.range.value.trim().toLowerCase() : "";
  const target = typeof spell.system.target?.value === "string" ? spell.system.target.value.trim().toLowerCase() : "";
  const self = ["you", "yourself", "self"].includes(target) || range === "self" && !target;
  if (self) {
    result.push({ kind: "self", icon: "user", text: localize("SelfShort", "Self"), label: localize("Self", "Targets only the caster") });
  } else if (range === "touch") {
    result.push({ kind: "touch", icon: "hand", text: localize("TouchShort", "Touch"), sourceRange: range,
      label: localize("Touch", "Range: touch") });
  } else {
    // PF2e's spell range getter also accepts numeric prefixes in conditional
    // ranges. Only a complete, unambiguous source range is shown here.
    const numeric = /^(\d+)\s*(feet|foot|ft\.?|miles?|mi\.?)$/.exec(range);
    if (numeric && Number(numeric[1]) > 0 && Number.isSafeInteger(Number(numeric[1]))) {
      const miles = numeric[2].startsWith("mi");
      result.push({ kind: "range", icon: "ruler", text: `${Number(numeric[1])}${miles ? "mi" : "′"}`, sourceRange: range,
        label: `${localize("Range", "Range")}: ${Number(numeric[1])} ${miles ? localize("Miles", "mi") : localize("Feet", "ft")}` });
    }
  }
  const duration = spell.system.duration;
  if (duration?.sustained === true) {
    result.push({ kind: "sustained", icon: "rotate", text: localize("SustainShort", "Sust"),
      label: `${localize("Sustained", "Sustained duration")}${typeof duration.value === "string" && duration.value.trim() ? `: ${duration.value.trim()}` : ""}` });
  } else if (typeof duration?.value === "string") {
    const value = duration.value.trim();
    const timed = /^(\d+)\s+(round|minute|hour|day|week|month|year)s?$/i.exec(value);
    const permanent = /^(unlimited|permanent)$/i.test(value);
    // An actual ongoing duration field is useful even when Shield's targeting
    // fields are empty. This never implies persistent DAMAGE or self targeting.
    if (timed && Number(timed[1]) > 0 || permanent || /^until\b/i.test(value)) {
      const short = timed && /^(round|minute|hour|day)$/i.test(timed[2]) ?
        `${Number(timed[1])}${timed[2][0].toLowerCase()}` : permanent ? "∞" : "";
      result.push({ kind: "duration", icon: "hourglass-half", text: short,
        label: `${localize("Duration", "Duration")}: ${value}` });
    }
  }
  if (spell.system.traits?.value?.includes("incapacitation")) {
    result.push({ kind: "incapacitation", icon: "triangle-exclamation", text: localize("IncapacitationShort", "Inc"),
      label: localize("Incapacitation", "Incapacitation trait — check target level") });
  }
  return result;
}

/** Never guess an overlay from a spell's name or description. */
export function spellIndicators(spell, { castRank, entryId, overlayIds } = {}, localize) {
  if (spell?.type !== "spell" || typeof spell.loadVariant !== "function") return [];
  if (!Number.isInteger(castRank) || castRank < 1 || castRank > 10) return [];
  try {
    const selected = spell.loadVariant({ castRank, entryId, ...(overlayIds ? { overlayIds } : {}) }) ?? spell;
    // An unselected multi-option spell must not claim one mode's mechanics.
    const overrides = Object.values(selected.system.overlays ?? {}).some(o => o.overlayType === "override");
    if (overrides && !selected.appliedOverlays?.has("override") && !overlayIds?.length) {
      return [{ kind: "variants", icon: "code-branch", label: localize?.("Variants", "Multiple casting options — open spell to choose") ??
        "Multiple casting options — open spell to choose" }];
    }
    return classifySpell(selected, localize);
  } catch {
    // Unknown or removed overlay/entry contracts affect this row only.
    return [];
  }
}

export function addSpellIndicators(host, indicators) {
  if (!host || !indicators.length) return null;
  const doc = host.ownerDocument;
  const group = doc.createElement("span");
  group.className = "patchwork-spell-information";
  for (const indicator of indicators) {
    const badge = doc.createElement("span");
    badge.className = "patchwork-spell-indicator";
    badge.dataset.kind = indicator.kind;
    if (indicator.kind === "save") badge.dataset.basic = String(indicator.basic);
    badge.title = indicator.label;
    badge.setAttribute("aria-label", indicator.label);
    badge.setAttribute("role", "img");
    badge.tabIndex = 0;
    const icon = doc.createElement("i");
    icon.className = `fa-solid fa-${indicator.icon}`;
    icon.setAttribute("aria-hidden", "true");
    badge.append(icon);
    if (indicator.text) {
      const text = doc.createElement("span");
      text.textContent = indicator.text;
      text.setAttribute("aria-hidden", "true");
      badge.append(text);
    }
    group.append(badge);
  }
  host.append(group);
  return group;
}
