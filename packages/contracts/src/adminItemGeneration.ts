import { z } from 'zod';
import {
  isTalismanScenario,
  ALCHEMY_PROPERTY_KEY_VALUES,
  PILL_APPEARANCE_GRADE_VALUES,
  PILL_FAMILY_VALUES,
} from '@daoyou/game-domain/consumables';
import {
  isOpenEquipmentLevel,
  DAO_WEAPON_TYPES,
} from '@daoyou/game-domain/equipment';
import { ELEMENT_VALUES } from '@daoyou/constants/elements';
import { QUALITY_VALUES } from '@daoyou/constants/qualities';

/** 附灵六维（与 Attributes 键一致）。 */
export const DAO_EQUIPMENT_BONUS_ATTR_KEYS = [
  'vitality',
  'strength',
  'spirit',
  'endurance',
  'speed',
  'willpower',
] as const;

export const DAO_FORMATION_SLOT_SCHEMA = z
  .object({
    patternId: z.string().min(1),
    level: z.number().int().min(1).max(32),
  })
  .nullable();

/** 器胚面板字段（与 CombatV6PanelAttr 一致）。 */
export const DAO_EQUIPMENT_PANEL_ATTR_KEYS = [
  'physicalAtk',
  'physicalDef',
  'magicAtk',
  'magicDef',
  'maxHp',
  'maxMp',
  'healPower',
  'speed',
  'hit',
  'dodge',
  'critRate',
  'spellCritRate',
  'physicalFuryRate',
  'sealHit',
  'sealResist',
] as const;

export const AdminItemGenerationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('pill'),
      name: z.string().trim().min(1).max(100),
      quality: z.enum(QUALITY_VALUES),
      effects: z.array(z.enum(ALCHEMY_PROPERTY_KEY_VALUES)).min(1).max(3),
      appearance: z.enum(PILL_APPEARANCE_GRADE_VALUES),
    })
    .strict(),
  z
    .object({
      kind: z.literal('spirit_fruit'),
      name: z.string().trim().min(1).max(100),
      quality: z.enum(QUALITY_VALUES),
      family: z.enum(PILL_FAMILY_VALUES),
    })
    .strict(),
  z
    .object({
      kind: z.literal('talisman'),
      scenario: z.string().refine(isTalismanScenario, '符箓玩法已停用'),
    })
    .strict(),
  z
    .object({
      kind: z.literal('equipment'),
      templateId: z.string().min(1),
      equipmentLevel: z.number().int().refine(isOpenEquipmentLevel),
      baseQuality: z.number().min(0).max(1),
      weaponType: z.enum(DAO_WEAPON_TYPES).optional(),
      // 以下为 GM 可指定的非器胚属性；缺省时沿用随机生成结果
      baseStats: z
        .array(
          z.object({
            attr: z.enum(DAO_EQUIPMENT_PANEL_ATTR_KEYS),
            value: z.number().int().min(0).max(1_000_000),
          }),
        )
        .max(4)
        .optional(),
      element: z.enum(ELEMENT_VALUES).optional(),
      attributeBonuses: z
        .array(
          z.object({
            attr: z.enum(DAO_EQUIPMENT_BONUS_ATTR_KEYS),
            value: z.number().int().min(1).max(1_000_000),
          }),
        )
        .max(2)
        .optional(),
      essenceIds: z.array(z.string().min(1)).max(2).optional(),
      artId: z.string().min(1).optional(),
      formationInscriptions: z
        .array(DAO_FORMATION_SLOT_SCHEMA)
        .length(2)
        .optional(),
    })
    .strict(),
]);
