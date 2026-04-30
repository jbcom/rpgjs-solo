export type StudioSkillToLearnEntry = {
  level?: number | string;
  skill?: string;
  skillId?: string;
  id?: string;
  _id?: string;
};

export type StudioRuntimeSkillToLearn = {
  level: number;
  skill: string;
  source: "studio";
};

const toLevel = (value: unknown): number | null => {
  const level = typeof value === "string" ? Number(value) : value;
  if (typeof level !== "number" || !Number.isFinite(level)) return null;
  return Math.max(1, Math.floor(level));
};

const toSkillId = (entry: unknown): string | null => {
  if (typeof entry === "string" && entry.trim()) return entry;
  if (!entry || typeof entry !== "object") return null;

  const candidate = entry as StudioSkillToLearnEntry;
  const skillId = candidate.skill ?? candidate.skillId ?? candidate.id ?? candidate._id;
  return typeof skillId === "string" && skillId.trim() ? skillId : null;
};

export const normalizeStudioSkillsToLearn = (
  value: unknown,
): StudioRuntimeSkillToLearn[] => {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const skills: StudioRuntimeSkillToLearn[] = [];

  for (const entry of value) {
    const level = toLevel(
      entry && typeof entry === "object"
        ? (entry as StudioSkillToLearnEntry).level
        : 1,
    );
    const skill = toSkillId(entry);
    if (level === null || !skill) continue;

    const key = `${level}:${skill}`;
    if (seen.has(key)) continue;
    seen.add(key);
    skills.push({ level, skill, source: "studio" });
  }

  return skills.sort((a, b) => a.level - b.level);
};

export const createStudioDefaultClass = (skillsToLearn: unknown) => {
  const normalizedSkillsToLearn = normalizeStudioSkillsToLearn(skillsToLearn);
  if (normalizedSkillsToLearn.length === 0) return null;

  return {
    id: "studio-default-class",
    name: "Studio Default Class",
    skillsToLearn: normalizedSkillsToLearn,
  };
};
