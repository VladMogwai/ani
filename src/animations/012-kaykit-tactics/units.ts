// Unit constructor. Every KayKit character is built on the same skeleton (Rig_Medium) and split into parts
// (Head, Body, ArmLeft, ArmRight, LegLeft, LegRight, plus Cape, Hat, Helmet, HelmetVisor, Mask, Quiver, BearHat, Cloak...).
// A unit = a base model, minus hidden parts, plus parts borrowed from other models, tinted, with items in its hands,
// optional bone scales (proportions) and named animations from the shared Rig_Medium library.
// The baker (/012-kaykit-tactics?bake) renders every unit into sprite sheets, the scene plays them.

export const SOURCE = '/src/animations/012-kaykit-tactics/source' // served by the dev server; the baker is dev-only
export const OUT = 'src/animations/012-kaykit-tactics/assets/units'

export const BAKE = {
  frame: 128, // logical px of a square frame (characters are about 75 px tall)
  resolution: 2, // sheets are stored at 2x and drawn at 0.5, sharp on Retina
  feet: 0.2, // feet height inside the frame, from the bottom
  ppu: 40, // logical px per world unit (Rig_Medium characters are about 2.4 units tall)
  fps: 12,
  quality: 0.9, // WebP quality of the sheets
  // camera: true 2:1 isometric (dimetric) view, 30 degrees down, 45 degrees around
  elevation: 30,
  // screen directions, one sheet row each, clockwise from east: E, SE, S, SW, W, NW, N, NE
  directions: 8,
}

export const ANIMATION_FILES = ['General', 'MovementBasic', 'MovementAdvanced', 'CombatMelee', 'CombatRanged', 'Simulation', 'Special'].map(
  (n) => `${SOURCE}/animations/Rig_Medium_${n}.glb`,
)

// base models: file in source/characters/ and the prefix of their part names
export const MODELS = {
  Knight: 'Knight',
  Mage: 'Mage',
  Rogue: 'Rogue',
  RogueHooded: 'Rogue_Hooded',
  Barbarian: 'Barbarian',
  Ranger: 'Ranger',
  SkeletonWarrior: 'Skeleton_Warrior',
  SkeletonMage: 'Skeleton_Mage',
} as const
export type Model = keyof typeof MODELS

// things a hand can hold: file in source/weapons/
export const ITEMS = {
  sword: 'sword_1handed',
  axe: 'axe_2handed',
  dagger: 'dagger',
  crossbow: 'crossbow_1handed',
  bow: 'bow_withString',
  staff: 'staff',
  wand: 'wand',
  spellbook: 'spellbook_open',
  mug: 'mug_full',
  shieldBadge: 'shield_badge_color',
  shieldSquare: 'shield_square_color',
  boneBlade: 'Skeleton_Blade',
  boneShield: 'Skeleton_Shield_Large_A',
  boneStaff: 'Skeleton_Staff',
} as const
export type Item = keyof typeof ITEMS

export type Anim = { clip: string; loop: boolean; fps?: number } // fps: override BAKE.fps for long, slow clips

export type UnitDef = {
  base: Model
  hide?: string[] // part names without the model prefix, e.g. 'Cape', 'Helmet'
  borrow?: { from: Model; part: string; tint?: string }[] // parts taken from another model
  tint?: Record<string, string> // part -> colour multiplied over its texture (darkens and colours it)
  right?: Item // item in the right hand
  left?: Item
  scale?: Record<string, number> // bone -> scale, e.g. { head: 0.8 } for less cartoonish proportions
  anims: Record<string, Anim> // our name -> KayKit clip; every unit needs `idle`
}

const fighter = (overrides: Record<string, Anim> = {}): Record<string, Anim> => ({
  idle: { clip: 'Idle_A', loop: true },
  walk: { clip: 'Walking_A', loop: true },
  attack: { clip: 'Melee_1H_Attack_Chop', loop: false },
  hurt: { clip: 'Hit_A', loop: false },
  die: { clip: 'Death_A', loop: false },
  ...overrides,
})

export const UNITS: Record<string, UnitDef> = {
  // the player: a neutral adventurer with a dagger (two genders later; faction looks come after level 3)
  hero: {
    base: 'Rogue',
    tint: { Cape: '#8a7a64', Body: '#c8bba4' },
    right: 'dagger',
    anims: fighter({
      attack: { clip: 'Melee_1H_Attack_Stab', loop: false },
      interact: { clip: 'Interact', loop: false },
    }),
  },
  // the KayKit knight as it comes
  knight: {
    base: 'Knight',
    right: 'sword',
    left: 'shieldBadge',
    anims: fighter({ cast: { clip: 'Ranged_Magic_Spellcasting', loop: false } }),
  },
  // knight without cape and visor, steel-blue city colours, square shield, smaller head
  guard: {
    base: 'Knight',
    hide: ['Cape', 'HelmetVisor'],
    tint: { Body: '#9fb4d6', ArmLeft: '#9fb4d6', ArmRight: '#9fb4d6', LegLeft: '#9fb4d6', LegRight: '#9fb4d6', Helmet: '#b8c4d8' },
    right: 'sword',
    left: 'shieldSquare',
    scale: { head: 0.82 },
    anims: fighter({ block: { clip: 'Melee_Blocking', loop: true } }),
  },
  // rogue in black with the knight's cape dyed blood red, pale head, dagger
  vampire: {
    base: 'Rogue',
    hide: ['Cape'],
    borrow: [{ from: 'Knight', part: 'Cape', tint: '#7a0f1c' }],
    tint: { Body: '#3a3440', ArmLeft: '#3a3440', ArmRight: '#3a3440', LegLeft: '#2a2630', LegRight: '#2a2630', Head: '#d6cfe6' },
    right: 'dagger',
    scale: { head: 0.85 },
    anims: fighter({
      walk: { clip: 'Sneaking', loop: true },
      attack: { clip: 'Melee_1H_Attack_Stab', loop: false },
      cast: { clip: 'Ranged_Magic_Summon', loop: false },
    }),
  },
  // skeleton mage with a bone staff and an open spellbook
  necromancer: {
    base: 'SkeletonMage',
    right: 'boneStaff',
    left: 'spellbook',
    anims: {
      idle: { clip: 'Skeletons_Idle', loop: true, fps: 6 }, // 4.25 s of slow swaying: 26 frames instead of 51
      walk: { clip: 'Skeletons_Walking', loop: true },
      cast: { clip: 'Ranged_Magic_Spellcasting_Long', loop: false },
      summon: { clip: 'Ranged_Magic_Summon', loop: false },
      hurt: { clip: 'Hit_B', loop: false },
      die: { clip: 'Skeletons_Death', loop: false },
    },
  },
  // the KayKit mage in green with the barbarian's bear hat instead of her own, wand and book
  druid: {
    base: 'Mage',
    hide: ['Hat'],
    borrow: [{ from: 'Barbarian', part: 'BearHat' }],
    tint: { Cape: '#5f7a4a', Body: '#8aa070' },
    right: 'wand',
    left: 'spellbook',
    anims: {
      idle: { clip: 'Idle_B', loop: true },
      walk: { clip: 'Walking_B', loop: true },
      cast: { clip: 'Ranged_Magic_Shoot', loop: false },
      heal: { clip: 'Ranged_Magic_Raise', loop: false },
      hurt: { clip: 'Hit_A', loop: false },
      die: { clip: 'Death_B', loop: false },
    },
  },
  // barbarian without his bear hat, with a mug: a peaceful NPC
  innkeeper: {
    base: 'Barbarian',
    hide: ['BearHat'],
    right: 'mug',
    anims: {
      idle: { clip: 'Idle_B', loop: true },
      walk: { clip: 'Walking_C', loop: true },
      wave: { clip: 'Waving', loop: false },
      cheer: { clip: 'Cheering', loop: false },
    },
  },
  // masked rogue with a crossbow
  bandit: {
    base: 'RogueHooded',
    tint: { Cape: '#4a4038', Body: '#6a5a48' },
    right: 'crossbow',
    scale: { head: 0.85 },
    anims: fighter({
      idle: { clip: 'Ranged_1H_Aiming', loop: true },
      attack: { clip: 'Ranged_1H_Shoot', loop: false },
      walk: { clip: 'Sneaking', loop: true },
    }),
  },
  // the five KayKit adventurers as they come, each with the weapons and moves of its class
  mage: {
    base: 'Mage',
    right: 'staff',
    left: 'spellbook',
    anims: {
      idle: { clip: 'Idle_A', loop: true },
      walk: { clip: 'Walking_A', loop: true },
      cast: { clip: 'Ranged_Magic_Spellcasting', loop: false },
      shoot: { clip: 'Ranged_Magic_Shoot', loop: false },
      hurt: { clip: 'Hit_A', loop: false },
      die: { clip: 'Death_A', loop: false },
    },
  },
  barbarian: {
    base: 'Barbarian',
    right: 'axe',
    anims: fighter({
      idle: { clip: 'Melee_2H_Idle', loop: true },
      attack: { clip: 'Melee_2H_Attack_Chop', loop: false },
      spin: { clip: 'Melee_2H_Attack_Spin', loop: false },
    }),
  },
  ranger: {
    base: 'Ranger',
    left: 'bow',
    anims: fighter({
      idle: { clip: 'Ranged_Bow_Idle', loop: true },
      draw: { clip: 'Ranged_Bow_Draw', loop: false },
      attack: { clip: 'Ranged_Bow_Release', loop: false },
    }),
  },
  rogue: {
    base: 'Rogue',
    right: 'dagger',
    left: 'dagger',
    anims: fighter({
      attack: { clip: 'Melee_Dualwield_Attack_Slice', loop: false },
      stab: { clip: 'Melee_Dualwield_Attack_Stab', loop: false },
      dodge: { clip: 'Dodge_Backward', loop: false },
    }),
  },
  rogueHooded: {
    base: 'RogueHooded',
    right: 'dagger',
    anims: fighter({
      walk: { clip: 'Sneaking', loop: true },
      attack: { clip: 'Melee_1H_Attack_Stab', loop: false },
      throw: { clip: 'Throw', loop: false },
    }),
  },
  skeleton: {
    base: 'SkeletonWarrior',
    right: 'boneBlade',
    left: 'boneShield',
    anims: fighter({
      idle: { clip: 'Skeletons_Idle', loop: true, fps: 6 }, // 4.25 s of slow swaying: 26 frames instead of 51
      walk: { clip: 'Skeletons_Walking', loop: true },
      die: { clip: 'Skeletons_Death', loop: false },
      rise: { clip: 'Skeletons_Awaken_Floor', loop: false },
    }),
  },
}

// written by the baker next to the sheets: <OUT>/<unit>.json
export type UnitSheets = {
  frame: number
  feet: number
  anims: Record<string, { frames: number; fps: number; loop: boolean }>
}
