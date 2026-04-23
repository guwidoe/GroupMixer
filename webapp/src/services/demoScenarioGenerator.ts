import type { Group, Person, Scenario } from '../types';
import { createDefaultSolverSettings } from './solverUi';

export interface GeneratedDemoScenarioOptions {
  groupCount: number;
  peoplePerGroup: number;
  sessionCount: number;
}

export const GENERATED_DEMO_CASE_ID = 'generated-random-workshop';
export const GENERATED_DEMO_CASE_NAME = 'Generate random workshop scenario';

const FIRST_NAMES = [
  'Aaliyah', 'Aaron', 'Abigail', 'Adam', 'Adrian', 'Aisha', 'Alan', 'Alejandro', 'Alex', 'Alexa',
  'Alexander', 'Alexis', 'Alice', 'Alicia', 'Amelia', 'Amir', 'Amy', 'Ana', 'Andre', 'Andrea',
  'Andrew', 'Angela', 'Anita', 'Anna', 'Anthony', 'Aria', 'Ariana', 'Arthur', 'Ava', 'Avery',
  'Benjamin', 'Bianca', 'Blake', 'Brandon', 'Brianna', 'Caleb', 'Camila', 'Carlos', 'Carmen', 'Caroline',
  'Carter', 'Charlotte', 'Chloe', 'Chris', 'Christian', 'Claire', 'Clara', 'Cole', 'Connor', 'Daniel',
  'Daniela', 'David', 'Delilah', 'Derek', 'Diana', 'Dominic', 'Eleanor', 'Elena', 'Eli', 'Eliana',
  'Elijah', 'Elizabeth', 'Ella', 'Ellie', 'Emily', 'Emma', 'Ethan', 'Eva', 'Evan', 'Evelyn',
  'Felix', 'Finn', 'Gabriel', 'Gabriella', 'Grace', 'Hailey', 'Hannah', 'Hazel', 'Henry', 'Hunter',
  'Ian', 'Iris', 'Isaac', 'Isabella', 'Isla', 'Jack', 'Jackson', 'Jacob', 'Jade', 'James',
  'Jasmine', 'Jason', 'Javier', 'Jayden', 'Jennifer', 'Jessica', 'Joel', 'John', 'Jonathan', 'Jordan',
  'Jose', 'Joseph', 'Joshua', 'Julia', 'Julian', 'Kaitlyn', 'Katherine', 'Kayla', 'Kevin', 'Landon',
  'Layla', 'Leah', 'Leo', 'Liam', 'Lila', 'Lillian', 'Lily', 'Logan', 'Lucas', 'Lucy',
  'Luke', 'Luna', 'Madeline', 'Madison', 'Mason', 'Mateo', 'Matthew', 'Maya', 'Mia', 'Michael',
  'Mila', 'Nathan', 'Nathaniel', 'Nora', 'Noah', 'Nolan', 'Olivia', 'Owen', 'Paisley', 'Parker',
  'Penelope', 'Riley', 'Robert', 'Ruby', 'Ryan', 'Sadie', 'Samuel', 'Santiago', 'Sarah', 'Savannah',
  'Scarlett', 'Sebastian', 'Skylar', 'Sofia', 'Sophie', 'Stella', 'Theodore', 'Thomas', 'Tyler', 'Victoria',
  'Violet', 'William', 'Wyatt', 'Xavier', 'Yara', 'Zara', 'Zoe',
] as const;

const LAST_NAMES = [
  'Adams', 'Allen', 'Anderson', 'Bailey', 'Baker', 'Barnes', 'Bell', 'Bennett', 'Brooks', 'Brown',
  'Butler', 'Campbell', 'Carter', 'Castillo', 'Chavez', 'Clark', 'Collins', 'Cook', 'Cooper', 'Cox',
  'Cruz', 'Davis', 'Diaz', 'Edwards', 'Evans', 'Fisher', 'Flores', 'Foster', 'Garcia', 'Gomez',
  'Gonzalez', 'Graham', 'Gray', 'Green', 'Griffin', 'Hall', 'Harris', 'Hayes', 'Henderson', 'Hernandez',
  'Hill', 'Howard', 'Hughes', 'Jackson', 'James', 'Jenkins', 'Johnson', 'Jones', 'Kelly', 'King',
  'Lee', 'Lewis', 'Long', 'Lopez', 'Martinez', 'Miller', 'Mitchell', 'Moore', 'Morgan', 'Morris',
  'Murphy', 'Myers', 'Nelson', 'Nguyen', 'Ortiz', 'Parker', 'Patel', 'Perez', 'Perry', 'Peterson',
  'Phillips', 'Powell', 'Price', 'Ramirez', 'Reed', 'Reyes', 'Richardson', 'Rivera', 'Roberts', 'Robinson',
  'Rodriguez', 'Rogers', 'Ross', 'Ruiz', 'Russell', 'Sanchez', 'Sanders', 'Scott', 'Simmons', 'Smith',
  'Stewart', 'Taylor', 'Thomas', 'Thompson', 'Torres', 'Turner', 'Walker', 'Ward', 'Watson', 'White',
  'Williams', 'Wilson', 'Wood', 'Wright', 'Young',
] as const;

const GROUP_PREFIXES = [
  'Amber', 'Azure', 'Cedar', 'Cobalt', 'Coral', 'Crimson', 'Dawn', 'Ember', 'Evergreen', 'Golden',
  'Granite', 'Harbor', 'Indigo', 'Ivy', 'Juniper', 'Lunar', 'Maple', 'Midnight', 'Moss', 'Nova',
  'Oak', 'Ocean', 'Olive', 'Onyx', 'Opal', 'Orchid', 'Pebble', 'Pine', 'Quartz', 'River',
  'Rose', 'Ruby', 'Saffron', 'Sage', 'Sapphire', 'Scarlet', 'Silver', 'Sky', 'Solar', 'Stone',
  'Summit', 'Sunset', 'Tidal', 'Timber', 'Topaz', 'Velvet', 'Willow', 'Winter',
] as const;

const GROUP_SUFFIXES = [
  'Auroras', 'Badgers', 'Comets', 'Cyclones', 'Falcons', 'Foxes', 'Hawks', 'Herons', 'Jets', 'Lanterns',
  'Lynx', 'Marlins', 'Meteorites', 'Otters', 'Owls', 'Panthers', 'Pioneers', 'Rangers', 'Ravens', 'Rockets',
  'Sailors', 'Sharks', 'Sparks', 'Starlings', 'Storm', 'Tigers', 'Trailblazers', 'Voyagers', 'Waves', 'Wolves',
] as const;

function normalizePositiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

function shuffleInPlace(values: number[]): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
}

function buildUniqueLabels(
  prefixPool: readonly string[],
  suffixPool: readonly string[],
  count: number,
  formatter: (prefix: string, suffix: string) => string,
): string[] {
  const normalizedCount = normalizePositiveInteger(count, 1);
  const pairCount = prefixPool.length * suffixPool.length;
  const shuffledPairIndexes = Array.from({ length: pairCount }, (_, index) => index);
  shuffleInPlace(shuffledPairIndexes);

  const labels: string[] = [];

  for (let index = 0; index < normalizedCount; index += 1) {
    const pairIndex = shuffledPairIndexes[index % pairCount];
    const prefix = prefixPool[Math.floor(pairIndex / suffixPool.length)];
    const suffix = suffixPool[pairIndex % suffixPool.length];
    const baseLabel = formatter(prefix, suffix);
    const cycle = Math.floor(index / pairCount);

    labels.push(cycle === 0 ? baseLabel : `${baseLabel} ${cycle + 1}`);
  }

  return labels;
}

function createPeople(count: number): Person[] {
  const names = buildUniqueLabels(FIRST_NAMES, LAST_NAMES, count, (first, last) => `${first} ${last}`);

  return names.map((name, index) => ({
    id: `person-${index + 1}`,
    attributes: {
      name,
    },
  }));
}

function createGroups(groupCount: number, peoplePerGroup: number): Group[] {
  const names = buildUniqueLabels(GROUP_PREFIXES, GROUP_SUFFIXES, groupCount, (prefix, suffix) => `${prefix} ${suffix}`);

  return names.map((name) => ({
    id: name,
    size: peoplePerGroup,
  }));
}

export function formatGeneratedDemoScenarioName(options: GeneratedDemoScenarioOptions): string {
  const groupCount = normalizePositiveInteger(options.groupCount, 6);
  const peoplePerGroup = normalizePositiveInteger(options.peoplePerGroup, 4);
  const sessionCount = normalizePositiveInteger(options.sessionCount, 4);

  return `Random Demo (${groupCount} groups × ${peoplePerGroup} people, ${sessionCount} sessions)`;
}

export function createGeneratedDemoScenario(options: GeneratedDemoScenarioOptions): Scenario {
  const groupCount = normalizePositiveInteger(options.groupCount, 6);
  const peoplePerGroup = normalizePositiveInteger(options.peoplePerGroup, 4);
  const sessionCount = normalizePositiveInteger(options.sessionCount, 4);
  const totalPeople = groupCount * peoplePerGroup;

  return {
    people: createPeople(totalPeople),
    groups: createGroups(groupCount, peoplePerGroup),
    num_sessions: sessionCount,
    constraints: [
      {
        type: 'RepeatEncounter',
        max_allowed_encounters: 1,
        penalty_function: 'squared',
        penalty_weight: 10,
      },
    ],
    settings: createDefaultSolverSettings(),
  };
}
