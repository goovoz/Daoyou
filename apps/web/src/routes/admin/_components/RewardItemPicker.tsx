import { apiFetch } from '@app/lib/api/fetch';
import {
  InventoryGrid,
  ItemSlot,
} from '@app/components/feature/items/ItemSlot';
import { InkButton, InkInput, InkNotice, InkSelect } from '@app/components/ui';
import { TALISMAN_SCENARIO_OPTIONS } from '@daoyou/game-domain/consumables';
import {
  rewardDisplayItem,
  RewardItemSchema,
  libraryMaterialGrant,
} from '@daoyou/game-rules/rewards/materials';
import { DAO_EQUIPMENT_TEMPLATES_V1 } from '@daoyou/game-content/equipment/base';
import { OPEN_EQUIPMENT_LEVELS } from '@daoyou/game-domain/equipment';
import { equipmentRealm } from '@daoyou/game-rules/equipment/forging';
import { DAO_WEAPONS } from '@daoyou/game-content/equipment/weapons';
import type { ItemGrant } from '@daoyou/game-domain/inventory';
import {
  INVENTORY_MATERIAL_TYPES,
  MATERIAL_TYPE_NAMES,
} from '@daoyou/game-domain/inventory';
import { ITEM_DEFINITIONS } from '@daoyou/game-content/items';
import { ALCHEMY_PROPERTY_LABELS } from '@daoyou/game-rules/alchemy';
import type { ItemLibraryEntry } from '@daoyou/game-domain/items/catalog';
import { QUALITY_VALUES } from '@daoyou/constants/qualities';
import { useEffect, useState } from 'react';
import { AdminDialog } from './AdminDialog';

const kinds = {
  beast_book: '传承灵印',
  beast_refinement: '归元灵露',
  beast_rejuvenation: '化生果',
  beast_lure: '引妖香',
  manual_jade: '功法玉简',
  blueprint: '图纸',
  inscription: '阵纹',
  material: '材料',
  seed: '灵种',
  pill: '丹药',
  spirit_fruit: '灵果',
  talisman: '符箓',
  equipment: '道装',
};
const families = {
  healing: '疗伤',
  mana: '回元',
  detox: '解毒',
  cultivation: '修为',
  beast_cultivation: '灵兽修为',
  insight: '感悟',
  breakthrough: '突破',
  tempering: '淬体',
  marrow_wash: '洗髓',
  longevity: '延寿',
  hybrid: '复合',
};
// [daoyou-fork L1] fork-patch: gm-panel —— 道装可指定属性选项
type EquipmentOptions = {
  elements: string[];
  baseStatRanges: Array<{ attr: string; min: number; max: number }>;
  bonusAttrs: Array<{ value: string; label: string }>;
  formationLevelLimits: Array<{ equipmentLevel: number; maxLevel: number }>;
  inscriptions: Array<{
    id: string;
    name: string;
    valuePerLevel: number;
  }>;
  essences: Array<{ id: string; name: string; description: string }>;
  arts: Array<{ id: string; name: string; description: string }>;
};

const PANEL_ATTR_LABELS: Record<string, string> = {
  physicalAtk: '物攻',
  physicalDef: '物防',
  magicAtk: '法攻',
  magicDef: '法防',
  maxHp: '气血',
  maxMp: '法力',
  healPower: '治疗',
  speed: '速度',
  hit: '命中',
  dodge: '闪避',
  critRate: '物暴',
  spellCritRate: '法暴',
  physicalFuryRate: '物怒',
  sealHit: '封禁命中',
  sealResist: '封禁抵抗',
};

type BonusDraft = { attr: string; value: string };
type FormationDraft = { patternId: string; level: string };

const EMPTY_BONUS: BonusDraft = { attr: '', value: '' };
const EMPTY_FORMATION: FormationDraft = { patternId: '', level: '1' };

export function RewardItemPicker({
  onSelect,
  disabled = false,
  label = '选择道具',
}: {
  onSelect: (item: ItemGrant) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<keyof typeof kinds>('beast_book');
  const [query, setQuery] = useState('');
  const [materialType, setMaterialType] = useState<string>('herb');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [materials, setMaterials] = useState<ItemGrant[]>([]);
  const [generated, setGenerated] = useState<
    Array<{ kind: string; item: ItemGrant }>
  >([]);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [quality, setQuality] = useState<string>('凡品');
  const [effect, setEffect] = useState('restore_hp');
  const [secondary, setSecondary] = useState('');
  const [tertiary, setTertiary] = useState('');
  const [appearance, setAppearance] = useState('middle');
  const [family, setFamily] = useState('healing');
  const [scenario, setScenario] = useState<string>(
    TALISMAN_SCENARIO_OPTIONS[0].value,
  );
  const [templateId, setTemplateId] = useState<string>(
    DAO_EQUIPMENT_TEMPLATES_V1[0].id,
  );
  const [level, setLevel] = useState('10');
  const [baseQuality, setBaseQuality] = useState('0');
  const [weapon, setWeapon] = useState('sword');
  // [daoyou-fork L1] fork-patch: gm-panel —— 道装非器胚属性
  const [element, setElement] = useState('');
  const [bonusA, setBonusA] = useState<BonusDraft>(EMPTY_BONUS);
  const [bonusB, setBonusB] = useState<BonusDraft>(EMPTY_BONUS);
  const [essenceIds, setEssenceIds] = useState<string[]>([]);
  const [artId, setArtId] = useState('');
  const [formationA, setFormationA] =
    useState<FormationDraft>(EMPTY_FORMATION);
  const [formationB, setFormationB] =
    useState<FormationDraft>(EMPTY_FORMATION);
  const [eqOptions, setEqOptions] = useState<EquipmentOptions | null>(null);
  const [baseDrafts, setBaseDrafts] = useState<Record<string, string>>({});
  const baseStatOverrides = Object.entries(baseDrafts)
    .filter(([, value]) => value.trim() !== '')
    .map(([attr, value]) => ({ attr, value: Number(value) }));
  const bonusDrafts = [bonusA, bonusB]
    .filter((draft) => draft.attr && draft.value.trim() !== '')
    .map((draft) => ({ attr: draft.attr, value: Number(draft.value) }));
  const formationDrafts = [formationA, formationB].some(
    (draft) => draft.patternId,
  )
    ? [formationA, formationB].map((draft) =>
        draft.patternId
          ? { patternId: draft.patternId, level: Number(draft.level) || 1 }
          : null,
      )
    : [];
  const formationMaxLevel =
    eqOptions?.formationLevelLimits.find(
      (rule) => rule.equipmentLevel === Number(level),
    )?.maxLevel ?? 0;
  const bonusHint = `数值范围 ${Math.max(1, Math.floor(Number(level) * 0.08))}~${Math.max(1, Math.floor(Number(level) * 0.14))}`;
  const setBonusAt = (index: number, next: BonusDraft) => {
    if (index === 0) setBonusA(next);
    else setBonusB(next);
  };
  const setFormationAt = (index: number, next: FormationDraft) => {
    if (index === 0) setFormationA(next);
    else setFormationB(next);
  };
  const isGenerator = [
    'pill',
    'spirit_fruit',
    'talisman',
    'equipment',
  ].includes(kind);
  const isLibrary = kind === 'material' || kind === 'seed';
  useEffect(() => {
    if (!open || !isLibrary) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPending(true);
      setError('');
      setMaterials([]);
      try {
        const params = new URLSearchParams({
          type: 'material',
          status: 'published',
          page: String(page),
          pageSize: '24',
          q: query,
          materialType: kind === 'seed' ? 'seed' : materialType,
        });
        const response = await apiFetch(`/api/admin/item-library?${params}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? '加载失败');
        const grants: ItemGrant[] = [];
        for (const entry of data.items as ItemLibraryEntry[]) {
          try {
            const grant = libraryMaterialGrant(entry);
            if ((grant.definitionId === 'seed.v1') === (kind === 'seed'))
              grants.push(grant);
          } catch {
            /* Historical unsupported materials are not selectable. */
          }
        }
        if (!controller.signal.aborted) {
          setMaterials(grants);
          setPages(data.totalPages ?? 1);
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        if (!controller.signal.aborted) setPending(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, isLibrary, kind, query, page, materialType]);
  // [daoyou-fork L1] fork-patch: gm-panel —— 拉取道装可指定的属性
  useEffect(() => {
    if (!open || kind !== 'equipment') return;
    let cancelled = false;
    void (async () => {
      try {
        const params = new URLSearchParams({
          templateId,
          equipmentLevel: level,
          baseQuality,
        });
        if (templateId.includes('.weapon.')) {
          params.set('weaponType', weapon);
        }
        const response = await apiFetch(
          `/api/admin/reward-items/equipment-options?${params.toString()}`,
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? '加载道装选项失败');
        if (cancelled) return;
        const options = data.data as EquipmentOptions;
        setEqOptions(options);
        setEssenceIds((prev) =>
          prev.filter((id) => options.essences.some((e) => e.id === id)),
        );
        setArtId((prev) =>
          prev && options.arts.some((a) => a.id === prev) ? prev : '',
        );
        setFormationA(EMPTY_FORMATION);
        setFormationB(EMPTY_FORMATION);
        setBaseDrafts({});
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '加载道装选项失败');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, kind, templateId, level, baseQuality, weapon]);
  const catalogue: ItemGrant[] = isGenerator
    ? generated
        .filter((entry) => entry.kind === kind)
        .map((entry) => entry.item)
    : ITEM_DEFINITIONS.filter((d) => d.kind === kind).map((d) => ({
        definitionId: d.id,
        quantity: 1,
      }));
  const filtered = catalogue.filter((item) =>
    rewardDisplayItem(item).name.includes(query),
  );
  const totalPages = isLibrary
    ? pages
    : Math.max(1, Math.ceil(filtered.length / 24));
  const items = isLibrary
    ? materials
    : filtered.slice((page - 1) * 24, page * 24);
  function select(item: ItemGrant) {
    onSelect(RewardItemSchema.parse(item));
    setOpen(false);
  }
  async function generate() {
    setPending(true);
    setError('');

    try {
      const input =
        kind === 'equipment'
          ? {
              kind,
              templateId,
              equipmentLevel: Number(level),
              baseQuality: Number(baseQuality),
              ...(templateId.includes('.weapon.')
                ? { weaponType: weapon }
                : {}),
              // [daoyou-fork L1] fork-patch: gm-panel —— 器胚与非器胚属性
              ...(baseStatOverrides.length
                ? { baseStats: baseStatOverrides }
                : {}),
              ...(element ? { element } : {}),
              ...(bonusDrafts.length
                ? { attributeBonuses: bonusDrafts }
                : {}),
              ...(essenceIds.length ? { essenceIds } : {}),
              ...(artId ? { artId } : {}),
              ...(formationDrafts.length
                ? { formationInscriptions: formationDrafts }
                : {}),
            }
          : kind === 'talisman'
            ? { kind, scenario }
            : kind === 'spirit_fruit'
              ? { kind, name, quality, family }
              : {
                  kind,
                  name,
                  quality,
                  effects: [effect, secondary, tertiary].filter(Boolean),
                  appearance,
                };
      const response = await apiFetch('/api/admin/reward-items/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '生成失败');
      const item = RewardItemSchema.parse(data.item);
      setGenerated((previous) => [{ kind, item }, ...previous]);
      setQuery('');
      setPage(1);
      setCreating(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败');
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <InkButton
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {label}
      </InkButton>
      <AdminDialog
        open={open}
        onClose={() => {
          setOpen(false);
          setCreating(false);
        }}
        title={creating ? `生成${kinds[kind]}` : '选择道具'}
        wide
        busy={pending}
        footer={
          creating ? (
            <>
              <InkButton disabled={pending} onClick={() => setCreating(false)}>
                返回道具列表
              </InkButton>
              <InkButton
                variant="primary"
                pending={pending}
                onClick={() => void generate()}
              >
                生成并预览
              </InkButton>
            </>
          ) : (
            <span className="text-ink-secondary mr-auto text-sm">
              点击物品格查看详情，在预览中选择。
            </span>
          )
        }
      >
        <div className="space-y-4">
          {!creating ? (
            <>
              <div
                className="flex flex-wrap gap-x-4 gap-y-2"
                role="group"
                aria-label="道具分类"
              >
                {Object.entries(kinds).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={kind === value}
                    disabled={pending}
                    className={`border-b-2 py-1 text-sm ${kind === value ? 'border-crimson text-crimson font-semibold' : 'text-ink-secondary hover:text-ink border-transparent'}`}
                    onClick={() => {
                      setKind(value as keyof typeof kinds);
                      setPage(1);
                      setQuery('');
                      setMaterials([]);
                      setError('');
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <InkInput
                  label="搜索道具"
                  value={query}
                  onChange={(v) => {
                    setQuery(v);
                    setPage(1);
                  }}
                />
                {kind === 'material' && (
                  <InkSelect
                    label="材料种类"
                    value={materialType}
                    onChange={(v) => {
                      setMaterialType(v);
                      setPage(1);
                    }}
                  >
                    {INVENTORY_MATERIAL_TYPES.map((v) => (
                      <option key={v} value={v}>
                        {MATERIAL_TYPE_NAMES[v]}
                      </option>
                    ))}
                  </InkSelect>
                )}
                {isGenerator && (
                  <InkButton
                    variant="primary"
                    onClick={() => {
                      setCreating(true);
                      setError('');
                    }}
                  >
                    生成{kinds[kind]}
                  </InkButton>
                )}
              </div>
              {pending ? (
                <InkNotice>加载中…</InkNotice>
              ) : (
                <InventoryGrid className="grid-cols-3 sm:grid-cols-6">
                  {items.map((item, index) => (
                    <ItemSlot
                      key={`${kind}-${page}-${index}`}
                      item={rewardDisplayItem(item)}
                      quantityLabel="奖励"
                    >
                      {(close) => (
                        <InkButton
                          variant="primary"
                          onClick={() => {
                            close();
                            select(item);
                          }}
                        >
                          选择此物
                        </InkButton>
                      )}
                    </ItemSlot>
                  ))}
                </InventoryGrid>
              )}
              {!pending && !items.length && (
                <div className="text-ink-secondary py-10 text-center text-sm">
                  {isGenerator &&
                  !generated.some((entry) => entry.kind === kind)
                    ? `尚未生成${kinds[kind]}，生成后将在这里预览与选择。`
                    : '没有匹配的道具'}
                </div>
              )}
              {totalPages > 1 && (
                <div className="border-ink/10 flex items-center justify-between border-t pt-3">
                  <InkButton
                    disabled={page <= 1 || pending}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    上一页
                  </InkButton>
                  <span className="font-mono text-sm">
                    {page} / {totalPages}
                  </span>
                  <InkButton
                    disabled={page >= totalPages || pending}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    下一页
                  </InkButton>
                </div>
              )}
            </>
          ) : (
            <>
              <fieldset
                disabled={pending}
                className="grid gap-3 sm:grid-cols-2"
              >
                {(kind === 'pill' || kind === 'spirit_fruit') && (
                  <>
                    <InkInput label="名称" value={name} onChange={setName} />
                    <InkSelect
                      label="品质"
                      value={quality}
                      onChange={setQuality}
                    >
                      {QUALITY_VALUES.map((q) => (
                        <option key={q}>{q}</option>
                      ))}
                    </InkSelect>
                  </>
                )}
                {kind === 'pill' && (
                  <>
                    {[
                      ['主药效', effect, setEffect],
                      ['辅药效', secondary, setSecondary],
                      ['第三药效', tertiary, setTertiary],
                    ].map(([label, value, setter], i) => (
                      <InkSelect
                        key={i}
                        label={label as string}
                        value={value as string}
                        onChange={setter as (v: string) => void}
                      >
                        {i > 0 && <option value="">无</option>}
                        {Object.entries(ALCHEMY_PROPERTY_LABELS).map(
                          ([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ),
                        )}
                      </InkSelect>
                    ))}
                    <InkSelect
                      label="品相"
                      value={appearance}
                      onChange={setAppearance}
                    >
                      {Object.entries({
                        low: '下品',
                        middle: '中品',
                        high: '上品',
                        perfect: '极品',
                      }).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </InkSelect>
                  </>
                )}
                {kind === 'spirit_fruit' && (
                  <InkSelect label="果效" value={family} onChange={setFamily}>
                    {Object.entries(families).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </InkSelect>
                )}
                {kind === 'talisman' && (
                  <InkSelect
                    label="用途"
                    value={scenario}
                    onChange={setScenario}
                  >
                    {TALISMAN_SCENARIO_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </InkSelect>
                )}
                {kind === 'equipment' && (
                  <>
                    <InkSelect
                      label="部位"
                      value={templateId}
                      onChange={setTemplateId}
                    >
                      {DAO_EQUIPMENT_TEMPLATES_V1.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </InkSelect>
                    <InkSelect label="境界" value={level} onChange={setLevel}>
                      {OPEN_EQUIPMENT_LEVELS.map((l) => (
                        <option key={l} value={l}>
                          {equipmentRealm(l).realm}
                        </option>
                      ))}
                    </InkSelect>
                    <InkInput
                      label="材料品阶进度（0～1）"
                      value={baseQuality}
                      onChange={setBaseQuality}
                    />
                    {templateId.includes('.weapon.') && (
                      <InkSelect
                        label="器形"
                        value={weapon}
                        onChange={setWeapon}
                      >
                        {Object.entries(DAO_WEAPONS).map(([v, d]) => (
                          <option key={v} value={v}>
                            {d.name}
                          </option>
                        ))}
                      </InkSelect>
                    )}
                    {/* [daoyou-fork L1] fork-patch: gm-panel —— 器胚与非器胚属性 */}
                    {eqOptions?.baseStatRanges.length ? (
                      <fieldset className="border-ink/15 rounded border p-2">
                        <legend className="text-ink/60 px-1 text-xs">
                          器胚属性（留空则按区间随机）
                        </legend>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {eqOptions.baseStatRanges.map((item) => (
                            <InkInput
                              key={item.attr}
                              label={`${PANEL_ATTR_LABELS[item.attr] ?? item.attr}（${item.min}~${item.max}）`}
                              value={baseDrafts[item.attr] ?? ''}
                              onChange={(value) =>
                                setBaseDrafts((prev) => ({
                                  ...prev,
                                  [item.attr]: value,
                                }))
                              }
                              placeholder={`${item.min}~${item.max}`}
                            />
                          ))}
                        </div>
                      </fieldset>
                    ) : null}
                    <InkSelect
                      label="五行属性"
                      value={element}
                      onChange={setElement}
                    >
                      <option value="">随机（按生成规则）</option>
                      {(eqOptions?.elements ?? []).map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </InkSelect>

                    {[0, 1].map((index) => {
                      const draft = index === 0 ? bonusA : bonusB;
                      return (
                        <div key={index} className="flex flex-wrap gap-2">
                          <div className="min-w-[9rem] flex-1">
                            <InkSelect
                              label={`附灵 ${index + 1} 属性`}
                              value={draft.attr}
                              onChange={(value) =>
                                setBonusAt(index, { ...draft, attr: value })
                              }
                            >
                              <option value="">无</option>
                              {(eqOptions?.bonusAttrs ?? []).map((item) => (
                                <option key={item.value} value={item.value}>
                                  {item.label}
                                </option>
                              ))}
                            </InkSelect>
                          </div>
                          <div className="min-w-[7rem] flex-1">
                            <InkInput
                              label="数值"
                              value={draft.value}
                              onChange={(value) =>
                                setBonusAt(index, { ...draft, value })
                              }
                              placeholder={bonusHint}
                            />
                          </div>
                        </div>
                      );
                    })}

                    {eqOptions?.essences.length ? (
                      <fieldset className="border-ink/15 rounded border p-2">
                        <legend className="text-ink/60 px-1 text-xs">
                          器蕴（最多 2 条）
                        </legend>
                        <div className="grid gap-1">
                          {eqOptions.essences.map((item) => (
                            <label
                              key={item.id}
                              className="text-ink/80 flex items-center gap-2 text-sm"
                              title={item.description}
                            >
                              <input
                                type="checkbox"
                                checked={essenceIds.includes(item.id)}
                                onChange={(event) => {
                                  if (event.target.checked) {
                                    setEssenceIds((prev) =>
                                      prev.length >= 2
                                        ? prev
                                        : [...prev, item.id],
                                    );
                                  } else {
                                    setEssenceIds((prev) =>
                                      prev.filter((id) => id !== item.id),
                                    );
                                  }
                                }}
                              />
                              {item.name}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ) : null}

                    {eqOptions?.arts.length ? (
                      <InkSelect label="器诀" value={artId} onChange={setArtId}>
                        <option value="">无</option>
                        {eqOptions.arts.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </InkSelect>
                    ) : null}

                    {eqOptions?.inscriptions.length ? (
                      <fieldset className="border-ink/15 rounded border p-2">
                        <legend className="text-ink/60 px-1 text-xs">
                          阵法灵纹（双孔，每孔上限 {formationMaxLevel} 级）
                        </legend>
                        {[0, 1].map((index) => {
                          const draft =
                            index === 0 ? formationA : formationB;
                          return (
                            <div
                              key={index}
                              className="flex flex-wrap gap-2 py-1"
                            >
                              <div className="min-w-[10rem] flex-1">
                                <InkSelect
                                  label={`${index + 1} 孔阵纹`}
                                  value={draft.patternId}
                                  onChange={(value) =>
                                    setFormationAt(index, {
                                      ...draft,
                                      patternId: value,
                                    })
                                  }
                                >
                                  <option value="">空孔</option>
                                  {(eqOptions?.inscriptions ?? []).map(
                                    (item) => (
                                      <option key={item.id} value={item.id}>
                                        {item.name}
                                      </option>
                                    ),
                                  )}
                                </InkSelect>
                              </div>
                              <div className="min-w-[6rem] flex-1">
                                <InkInput
                                  label="等级"
                                  value={draft.level}
                                  onChange={(value) =>
                                    setFormationAt(index, {
                                      ...draft,
                                      level: value,
                                    })
                                  }
                                  placeholder={`1~${formationMaxLevel}`}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </fieldset>
                    ) : null}
                  </>
                )}
              </fieldset>
            </>
          )}
          {error && <InkNotice tone="warning">{error}</InkNotice>}
        </div>
      </AdminDialog>
    </>
  );
}
