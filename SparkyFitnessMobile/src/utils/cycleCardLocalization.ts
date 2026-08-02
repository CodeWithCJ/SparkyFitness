import type { TFunction } from 'i18next';

export function getCycleCardModeTitle(
  t: TFunction,
  mode?: string,
  discreetMode = false,
): string {
  if (discreetMode) return t('cycleCard.title.wellness');
  switch (mode) {
    case 'pregnant':
      return t('cycleCard.title.pregnancy');
    case 'ttc':
      return t('cycleCard.title.fertility');
    case 'postpartum':
      return t('cycleCard.title.postpartum');
    case 'menopause':
      return t('cycleCard.title.menopause');
    case 'standard':
      return t('cycleCard.title.cycle');
    default:
      return t('cycleCard.title.cycleAndPregnancy');
  }
}

export function getCycleCardPhaseLabel(
  t: TFunction,
  phase: string,
  discreetMode = false,
): string {
  if (discreetMode) return t('cycleCard.phase.active');
  switch (phase) {
    case 'menstrual':
      return t('cycleCard.phase.menstrual');
    case 'follicular':
      return t('cycleCard.phase.follicular');
    case 'fertile':
      return t('cycleCard.phase.fertile');
    case 'ovulation':
      return t('cycleCard.phase.ovulation');
    case 'luteal':
      return t('cycleCard.phase.luteal');
    default:
      return t('cycleCard.phase.active');
  }
}

export function getBabyComparisonLabel(t: TFunction, comparison: string): string {
  switch (comparison) {
    case 'A poppy seed':
      return t('cycleCard.babyComparison.poppySeed');
    case 'A sesame seed':
      return t('cycleCard.babyComparison.sesameSeed');
    case 'A lentil':
      return t('cycleCard.babyComparison.lentil');
    case 'A blueberry':
      return t('cycleCard.babyComparison.blueberry');
    case 'A raspberry':
      return t('cycleCard.babyComparison.raspberry');
    case 'A cherry':
      return t('cycleCard.babyComparison.cherry');
    case 'A strawberry':
      return t('cycleCard.babyComparison.strawberry');
    case 'A lime':
      return t('cycleCard.babyComparison.lime');
    case 'A plum':
      return t('cycleCard.babyComparison.plum');
    case 'A peapod':
      return t('cycleCard.babyComparison.peapod');
    case 'A lemon':
      return t('cycleCard.babyComparison.lemon');
    case 'An apple':
      return t('cycleCard.babyComparison.apple');
    case 'An avocado':
      return t('cycleCard.babyComparison.avocado');
    case 'A turnip':
      return t('cycleCard.babyComparison.turnip');
    case 'A bell pepper':
      return t('cycleCard.babyComparison.bellPepper');
    case 'A mango':
      return t('cycleCard.babyComparison.mango');
    case 'A banana':
      return t('cycleCard.babyComparison.banana');
    case 'A carrot':
      return t('cycleCard.babyComparison.carrot');
    case 'A spaghetti squash':
      return t('cycleCard.babyComparison.spaghettiSquash');
    case 'A large mango':
      return t('cycleCard.babyComparison.largeMango');
    case 'An ear of corn':
      return t('cycleCard.babyComparison.earOfCorn');
    case 'A rutabaga':
      return t('cycleCard.babyComparison.rutabaga');
    case 'A scallion bunch':
      return t('cycleCard.babyComparison.scallionBunch');
    case 'A cauliflower':
      return t('cycleCard.babyComparison.cauliflower');
    case 'An eggplant':
      return t('cycleCard.babyComparison.eggplant');
    case 'A butternut squash':
      return t('cycleCard.babyComparison.butternutSquash');
    case 'A large cabbage':
      return t('cycleCard.babyComparison.largeCabbage');
    case 'A coconut':
      return t('cycleCard.babyComparison.coconut');
    case 'A jicama':
      return t('cycleCard.babyComparison.jicama');
    case 'A pineapple':
      return t('cycleCard.babyComparison.pineapple');
    case 'A cantaloupe':
      return t('cycleCard.babyComparison.cantaloupe');
    case 'A honeydew melon':
      return t('cycleCard.babyComparison.honeydewMelon');
    case 'A head of romaine':
      return t('cycleCard.babyComparison.headOfRomaine');
    case 'A bunch of Swiss chard':
      return t('cycleCard.babyComparison.swissChard');
    case 'A leek':
      return t('cycleCard.babyComparison.leek');
    case 'A mini watermelon':
      return t('cycleCard.babyComparison.miniWatermelon');
    case 'A small pumpkin':
      return t('cycleCard.babyComparison.smallPumpkin');
    default:
      return comparison;
  }
}
