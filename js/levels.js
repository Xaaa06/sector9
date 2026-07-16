// Declarative level definitions: each level is a name + waves, each wave a
// map of enemyType -> count. New enemy types unlock as levels progress;
// level 5 ends with the boss.
const LEVELS = [
  {
    name: 'FIRST CONTACT',
    waves: [
      { zombie: 5 },
      { zombie: 7 },
      { zombie: 10 },
    ],
  },
  {
    name: 'THEY RUN',
    waves: [
      { zombie: 4, runner: 3 },
      { runner: 6, zombie: 3 },
      { runner: 7, zombie: 5 },
    ],
  },
  {
    name: 'ARMED RESISTANCE',
    waves: [
      { zombie: 5, soldier: 2 },
      { runner: 4, soldier: 3 },
      { zombie: 6, runner: 4, soldier: 4 },
    ],
  },
  {
    name: 'HEAVY METAL',
    waves: [
      { tank: 2, zombie: 5 },
      { soldier: 3, tank: 2, runner: 4 },
      { tank: 3, soldier: 4, zombie: 6 },
    ],
  },
  {
    name: 'THE MACHINE',
    waves: [
      { runner: 5, soldier: 3 },
      { tank: 2, soldier: 4, runner: 3 },
      { boss: 1 },
    ],
  },
];
