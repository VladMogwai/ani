// Swappable parts of a character, the attacks they give and how each rig names its clips.
// Mesh names match tools/mercenary.py and tools/mercenary_ual.py: `<slot>__<variant>` for body parts,
// `item_<name>` for things held in the hands. The vampire's partial transformation swaps hands for claws
// (and adds a hunch); a hand that turns into a claw puts its item into the inventory, and it stays there
// until it is equipped again.
import nosferatuUrl from './assets/kit-nosferatu.glb?url'
import rangerUrl from './assets/kit-ranger.glb?url'
import peasantUrl from './assets/kit-peasant.glb?url'
import peasantFemaleUrl from './assets/kit-peasant-female.glb?url'

// Mixamo "Creature Pack" clips retargeted onto our rig (tools/mixamo_clips.py). They live in the gitignored licensed/
// folder (Mixamo files may not be redistributed): optional, everything falls back to our own clips without them.
const mixamo = import.meta.glob('./licensed/mixamo-clips.glb', { query: '?url', import: 'default', eager: true })
export const MIXAMO_URL = Object.values(mixamo)[0] as string | undefined

export const SLOTS = {
  armR: { label: 'Right arm', variants: ['human', 'claw'] },
  armL: { label: 'Left arm', variants: ['human', 'claw'] },
} as const

export type Slot = keyof typeof SLOTS
export type Form = { [S in Slot]: (typeof SLOTS)[S]['variants'][number] }
export const HUMAN: Form = { armR: 'human', armL: 'human' }

export type Race = 'human' | 'vampire'
// skin tint per race: our models bake skin white (grime only); kit textures are lightened at build (kit_character.py)
export const SKIN: Record<'baked' | 'texture', Record<Race, string>> = {
  baked: { human: '#a8795a', vampire: '#cfc8c2' },
  texture: { human: '#ffffff', vampire: '#d8dce6' }, // vampires are paler and cooler
}

export type Item = 'sword' | 'shield'
export const ITEM_HAND: Record<Item, Slot> = { sword: 'armR', shield: 'armL' }
export type Equipped = Record<Item, boolean>

export const ATTACKS = {
  SwordSlash: { label: 'Sword slash', damage: '6–12', effect: '', range: 1.3 },
  SwordCombo: { label: 'Sword combo', damage: '3× 5–10', effect: '', range: 1.3 },
  ShieldBash: { label: 'Shield bash', damage: '2–5', effect: 'stun 1 s', range: 0.9 },
  Punch: { label: 'Punch (right)', damage: '1–4', effect: '', range: 0.7 },
  PunchL: { label: 'Punch (left)', damage: '1–4', effect: '', range: 0.7 },
  ClawSwipe: { label: 'Claw hook (right)', damage: '8–14', effect: 'bleed', range: 0.9 },
  ClawSwipeL: { label: 'Claw hook (left)', damage: '8–14', effect: 'bleed', range: 0.9 },
  DoubleClaw: { label: 'Hook + uppercut', damage: '8–14 + 10–16', effect: 'bleed', range: 0.9 },
  DoubleHook: { label: 'Double hook', damage: '2× 8–14', effect: 'bleed', range: 0.9 },
  // Mixamo creature moves (when licensed/mixamo-clips.glb is present)
  ClawLunge: { label: 'Claw lunge', damage: '10–16', effect: 'bleed', range: 1.0 },
  Swipe: { label: 'Claw swipes', damage: '3× 6–12', effect: 'bleed', range: 1.0 },
  Pounce: { label: 'Pounce', damage: '14–22', effect: 'knockdown', range: 2.5 },
  Roar: { label: 'Roar', damage: '—', effect: 'fear 3 s', range: 4 },
  Scream: { label: 'Scream', damage: '—', effect: 'stun 1 s', range: 3 },
  // Mixamo magic (empty human hands)
  Spell: { label: 'Spell (one hand)', damage: '8–14', effect: '', range: 8 },
  Spell2H: { label: 'Spell (two hands)', damage: '12–20', effect: '', range: 8 },
  AreaSpell: { label: 'Area spell', damage: '6–10', effect: 'all around', range: 4 },
} as const
export type Attack = keyof typeof ATTACKS

export const claws = (form: Form) => (form.armR === 'claw' ? 1 : 0) + (form.armL === 'claw' ? 1 : 0)

// which meshes are shown: one variant per slot, items only when equipped (and so in a human hand)
export function visibleParts(form: Form, eq: Equipped): Record<string, boolean> {
  const parts: Record<string, boolean> = { item_sword: eq.sword, item_shield: eq.shield }
  for (const slot of Object.keys(SLOTS) as Slot[]) {
    for (const v of SLOTS[slot].variants) parts[`${slot}__${v}`] = form[slot] === v
  }
  return parts
}

// the attacks a form has: each hand gives its claw, its item's attack or a punch; two claws strike together
export function attacksOf(form: Form, eq: Equipped): Attack[] {
  if (claws(form) === 2) return MIXAMO_URL ? ['Swipe', 'Pounce', 'Roar', 'Scream'] : ['DoubleClaw', 'DoubleHook']
  const right: Attack[] = form.armR === 'claw' ? [MIXAMO_URL ? 'ClawLunge' : 'ClawSwipe'] : eq.sword ? ['SwordSlash', 'SwordCombo'] : ['Punch']
  const left: Attack = form.armL === 'claw' ? 'ClawSwipeL' : eq.shield ? 'ShieldBash' : 'PunchL'
  const mage = MIXAMO_URL && claws(form) === 0 && !eq.sword && !eq.shield
  return mage ? [...right, left, 'Spell', 'Spell2H', 'AreaSpell'] : [...right, left]
}

type Role = 'Idle' | 'SwordIdle' | 'ShieldIdle' | 'ClawIdle' | 'ClawStance' | 'Walk' | 'Run' | 'ClawWalk' | 'BeastIdle' | 'BeastWalk' | 'BeastRun'
export type Rig = {
  label: string
  url: string
  height: number // metres
  clips: Record<Role, string>
  attacks: Partial<Record<Attack, string>>
  speed: Partial<Record<Role, number>> // m/s of walk clips, so the ground slides without foot sliding
  zombie: boolean // has the pack's zombie idle/walk clips and the own claw stance
  hunchBones?: string[] // bones the Hunch layer may rotate (the exporter writes rest values for all others)
}

export const RIGS = {
  ual: {
    label: 'Quaternius',
    url: rangerUrl,
    height: 1.83,
    clips: {
      Idle: 'Idle_Loop', SwordIdle: 'Sword_Idle', ShieldIdle: 'Idle_Shield_Loop', ClawIdle: 'Zombie_Idle_Loop',
      ClawStance: 'Claw_Stance', // own: the vampire's wide predatory crouch, built with IK in tools/mercenary_ual.py
      Walk: MIXAMO_URL ? 'Human_Walk' : 'Walk_Loop', // the user's Mixamo walk when present
      ClawWalk: 'Zombie_Walk_Fwd_Loop',
      Run: MIXAMO_URL ? 'Human_Run' : 'Jog_Fwd_Loop', // the user's Mixamo "Slow Run" (a fast walk) when present
      BeastIdle: 'Mutant_Idle', BeastWalk: 'Mutant_Walk', BeastRun: 'Mutant_Run', // Mixamo, optional
    },
    attacks: {
      SwordSlash: 'Sword_Attack', SwordCombo: 'Sword_Regular_Combo', ShieldBash: 'Shield_Dash',
      Punch: 'Punch_Jab', PunchL: 'Punch_Cross',
      // own claw strikes from the idle (tools/mercenary_ual.py MOVES): hook, hook + uppercut, double hook
      ClawSwipe: 'Claw_Swipe_R', ClawSwipeL: 'Claw_Swipe_L', DoubleClaw: 'Claw_Double', DoubleHook: 'Claw_DoubleHook',
      ClawLunge: 'Mutant_Punch', Swipe: 'Mutant_Swiping', Pounce: 'Mutant_JumpAttack', Roar: 'Mutant_Roar',
      Scream: 'Zombie_Scream',
      Spell: 'Mage_1hMagicAttack01', Spell2H: 'Mage_2hMagicAttack01', AreaSpell: 'Mage_2hMagicAreaAttack01',
    },
    speed: { Walk: MIXAMO_URL ? 1.47 : 1.22, Run: MIXAMO_URL ? 2.75 : 6.58, ClawWalk: 1.31, BeastWalk: 1.17, BeastRun: 2.09 }, // measured from root motion (Mixamo scaled to our hips)
    zombie: true,
    hunchBones: ['spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r',
      'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r'],
  },
} satisfies Record<string, Rig>
export type RigId = keyof typeof RIGS

// characters on the Quaternius rig (same clips and slots), all from Quaternius kit parts (tools/kit_character.py),
// restyled in the viewer: ranger (hero), peasants (villagers), nosferatu (the vampire's true form: the base body made
// gaunt, bald, ears and fangs). `hair` tints the kit's grey hair texture. (Our primitive models were dropped: they
// looked unfinished next to the kit.)
// eyes: the colour the eyes glow in the combat face (a key of CONFIG.eyeColors in index.tsx), one per character
type Character = { url: string; skin: 'baked' | 'texture'; hair?: string; eyes: string }
export const CHARACTERS = {
  ranger: { url: rangerUrl, skin: 'texture', hair: '#3a2a1e', eyes: 'amber' },
  peasant: { url: peasantUrl, skin: 'texture', hair: '#4a3626', eyes: 'blood' },
  peasant_female: { url: peasantFemaleUrl, skin: 'texture', hair: '#2b1d15', eyes: 'violet' },
  nosferatu: { url: nosferatuUrl, skin: 'texture', eyes: 'venom' },
} satisfies Record<string, Character>
export type CharacterId = keyof typeof CHARACTERS
