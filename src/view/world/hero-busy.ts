// GAME-235 · чи руки героя зайняті дією: сцена серця (GAME-230) не відкривається посеред плавання, риболовлі, намету, дров, вогнища, гриля чи удару по ящику.
export interface HeroActivity {
  readonly acting: boolean;
  readonly inWater: boolean;
  readonly fishing: boolean;
  readonly tent: boolean;
  readonly wood: boolean;
  readonly fire: boolean;
  readonly grill: boolean;
  readonly smash: boolean;
}

export function heroBusy(a: HeroActivity): boolean {
  return a.acting || a.inWater || a.fishing || a.tent || a.wood || a.fire || a.grill || a.smash;
}
