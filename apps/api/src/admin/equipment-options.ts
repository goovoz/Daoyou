// [daoyou-fork L1] fork-patch: gm-panel
// 道装「非器胚属性」的选项目录与合法性校验：五行、附灵六维、器蕴、器诀、双孔阵纹。
import {
  DAO_EQUIPMENT_BASE_GENERATION,
  DAO_EQUIPMENT_TEMPLATES_V1,
  daoEquipmentTemplateOf,
  daoFormationInscriptionOf,
  DAO_FORMATION_INSCRIPTIONS_V1,
} from '@daoyou/game-content/equipment/base';
import {
  equipmentArtPool,
  equipmentEssencePool,
} from '@daoyou/game-content/equipment/forging';
import {
  DAO_EQUIPMENT_ARTS_V1,
  DAO_EQUIPMENT_ESSENCES_V1,
} from '@daoyou/game-content/equipment/special';
import { ELEMENT_VALUES } from '@daoyou/constants/elements';
import { daoEquipmentBaseRange } from '@daoyou/game-rules/equipment/forging';
import { daoFormationMaxLevel } from '@daoyou/game-rules/equipment/projection';
import { OPEN_EQUIPMENT_LEVELS } from '@daoyou/game-domain/equipment';
import type { DaoEquipmentSlot, DaoWeaponType } from '@daoyou/game-domain/equipment';

export const BONUS_ATTR_LABELS: Record<string, string> = {
  vitality: '体魄',
  strength: '力道',
  spirit: '灵力',
  endurance: '根骨',
  speed: '身法',
  willpower: '神识',
};

/**
 * 双孔阵纹每孔等级上限。直接取 game-rules 的 daoFormationMaxLevel，
 * 与库存校验 / 战斗投影共用同一份配置，不再本地复刻。
 */
export const FORMATION_LEVEL_LIMITS: Array<{
  equipmentLevel: number;
  maxLevel: number;
}> = OPEN_EQUIPMENT_LEVELS.map((equipmentLevel) => ({
  equipmentLevel,
  maxLevel: daoFormationMaxLevel(equipmentLevel),
}));

export function formationMaxLevel(equipmentLevel: number): number {
  return daoFormationMaxLevel(equipmentLevel);
}

/**
 * 附灵单条数值区间：直接取内容包的 bonusRanges 真值表，
 * 与 game-rules/equipment/ranges.ts 的 daoEquipmentAttributeRange 完全一致。
 * 例：10 阶（炼气）4~7、30 阶 7~14、50 阶 11~22、70 阶 15~29、90 阶 18~36。
 */
export function bonusValueRange(equipmentLevel: number): {
  min: number;
  max: number;
} | null {
  const range = DAO_EQUIPMENT_BASE_GENERATION.bonusRanges.find(
    (r) => r.level === equipmentLevel,
  );
  return range ? { min: range.min, max: range.max } : null;
}

/**
 * 器胚单字段区间：直接调用 game-rules 导出的 daoEquipmentBaseRange，
 * 不复刻取整顺序，避免与源码漂移。境界未开放时返回 null。
 */
export function baseStatRange(params: {
  templateId: string;
  equipmentLevel: number;
  baseQuality: number;
  weaponType?: string;
  attr: string;
}): { min: number; max: number } | null {
  const template = daoEquipmentTemplateOf(params.templateId);
  if (!template) return null;
  const rule = template.baseStats.find((item) => item.attr === params.attr);
  if (!rule) return null;
  // daoEquipmentBaseRange 在境界未开放时抛错，先自行判定
  if (!rule.ranges.some((r) => r.level === params.equipmentLevel)) return null;

  const quality = Math.min(1, Math.max(0, params.baseQuality));
  return daoEquipmentBaseRange(
    rule,
    params.equipmentLevel,
    quality,
    params.weaponType as DaoWeaponType | undefined,
  );
}

export function buildEquipmentOptions(
  templateId?: string,
  options?: {
    equipmentLevel?: number;
    baseQuality?: number;
    weaponType?: string;
  },
) {
  const template = templateId ? daoEquipmentTemplateOf(templateId) : undefined;
  const slot: DaoEquipmentSlot | undefined = template?.slot;

  const essenceIds = slot ? equipmentEssencePool(slot) : [];
  const artIds = slot ? equipmentArtPool(slot) : [];

  const baseStatRanges =
    template && options?.equipmentLevel
      ? template.baseStats.flatMap((rule) => {
          const range = baseStatRange({
            templateId: template.id,
            equipmentLevel: options.equipmentLevel!,
            baseQuality: options.baseQuality ?? 0,
            weaponType: options.weaponType,
            attr: rule.attr,
          });
          return range
            ? [{ attr: rule.attr as string, min: range.min, max: range.max }]
            : [];
        })
      : [];

  return {
    elements: [...ELEMENT_VALUES],
    baseStatRanges,
    bonusAttrs: Object.entries(BONUS_ATTR_LABELS).map(([value, label]) => ({
      value,
      label,
    })),
    templates: DAO_EQUIPMENT_TEMPLATES_V1.map((t) => ({
      id: t.id,
      name: t.name,
      slot: t.slot,
    })),
    formationLevelLimits: FORMATION_LEVEL_LIMITS,
    inscriptions: DAO_FORMATION_INSCRIPTIONS_V1.filter(
      (item) => !slot || item.allowedSlots.includes(slot),
    ).map((item) => ({
      id: item.id,
      name: item.name,
      attr: item.attr,
      valuePerLevel: item.valuePerLevel,
      allowedSlots: item.allowedSlots,
    })),
    essences: DAO_EQUIPMENT_ESSENCES_V1.filter((item) =>
      essenceIds.includes(item.id),
    ).map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description ?? '',
      stackPolicy: item.stackPolicy,
    })),
    arts: DAO_EQUIPMENT_ARTS_V1.filter((item) => artIds.includes(item.id)).map(
      (item) => ({
        id: item.id,
        name: item.name,
        description: item.description ?? '',
        rageCost: item.rageCost,
      }),
    ),
    baseBonusRanges: DAO_EQUIPMENT_BASE_GENERATION.bonusRanges,
  };
}

export type EquipmentOverrideInput = {
  baseStats?: Array<{ attr: string; value: number }>;
  element?: string;
  attributeBonuses?: Array<{ attr: string; value: number }>;
  essenceIds?: string[];
  artId?: string;
  formationInscriptions?: Array<{
    patternId: string;
    level: number;
  } | null>;
};

/**
 * 校验 GM 指定的属性是否合法，返回中文错误列表（空数组表示通过）。
 * 规则来源：器胚境界区间、附灵六维区间、器蕴/器诀部位限制、阵纹部位与等级上限。
 */
export function validateEquipmentOverrides(params: {
  templateId: string;
  equipmentLevel: number;
  baseQuality?: number;
  weaponType?: string;
  input: EquipmentOverrideInput;
}): string[] {
  const errors: string[] = [];
  const template = daoEquipmentTemplateOf(params.templateId);
  if (!template) return ['未知道装模板'];
  const slot = template.slot;

  if (params.input.baseStats) {
    const seen = new Set<string>();
    for (const stat of params.input.baseStats) {
      const range = baseStatRange({
        templateId: params.templateId,
        equipmentLevel: params.equipmentLevel,
        baseQuality: params.baseQuality ?? 0,
        weaponType: params.weaponType,
        attr: stat.attr,
      });
      if (!range) {
        errors.push(`该部位没有器胚字段：${stat.attr}`);
        continue;
      }
      if (seen.has(stat.attr)) errors.push('器胚字段不能重复');
      seen.add(stat.attr);
      if (stat.value < range.min || stat.value > range.max) {
        errors.push(
          `器胚「${stat.attr}」需在 ${range.min}~${range.max}（${params.equipmentLevel} 阶，品阶进度 ${(params.baseQuality ?? 0).toFixed(2)}）`,
        );
      }
    }
  }

  if (params.input.attributeBonuses) {
    const list = params.input.attributeBonuses;
    const range = bonusValueRange(params.equipmentLevel);
    if (!range) {
      errors.push(`${params.equipmentLevel} 阶道装尚未开放附灵`);
      return errors;
    }
    if (list.length > 2) errors.push('附灵最多 2 条');
    const seen = new Set<string>();
    for (const bonus of list) {
      if (!BONUS_ATTR_LABELS[bonus.attr]) {
        errors.push(`未知附灵属性：${bonus.attr}`);
        continue;
      }
      if (seen.has(bonus.attr)) errors.push('同件附灵属性不能重复');
      seen.add(bonus.attr);
      if (bonus.value < range.min || bonus.value > range.max) {
        errors.push(
          `附灵「${BONUS_ATTR_LABELS[bonus.attr]}」数值需在 ${range.min}~${range.max}（${params.equipmentLevel} 阶）`,
        );
      }
    }
  }

  if (params.input.essenceIds) {
    const pool = equipmentEssencePool(slot);
    const list = params.input.essenceIds;
    if (list.length > 2) errors.push('器蕴最多 2 条');
    if (new Set(list).size !== list.length) errors.push('器蕴不能重复');
    for (const id of list) {
      if (!pool.includes(id)) {
        errors.push(`器蕴「${id}」不适用于该部位`);
      }
    }
  }

  if (params.input.artId) {
    const pool = equipmentArtPool(slot);
    if (!pool.includes(params.input.artId)) {
      errors.push(`器诀「${params.input.artId}」不适用于该部位`);
    }
  }

  if (params.input.formationInscriptions) {
    const maxLevel = formationMaxLevel(params.equipmentLevel);
    params.input.formationInscriptions.forEach((entry, index) => {
      if (!entry) return;
      const def = daoFormationInscriptionOf(entry.patternId);
      if (!def) {
        errors.push(`第 ${index + 1} 孔阵纹不存在`);
        return;
      }
      if (!def.allowedSlots.includes(slot)) {
        errors.push(`阵纹「${def.name}」不适用于该部位`);
      }
      if (entry.level < 1 || entry.level > maxLevel) {
        errors.push(
          `第 ${index + 1} 孔阵纹等级需在 1~${maxLevel}（${params.equipmentLevel} 阶）`,
        );
      }
    });
  }

  return errors;
}
