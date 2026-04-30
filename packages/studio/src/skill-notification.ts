const getSkillDisplayName = (payload: any): string => {
  const skill = payload?.skill;
  const name =
    typeof skill?.name === "function"
      ? skill.name()
      : skill?.name ?? payload?.skillId;
  return typeof name === "string" && name.trim() ? name : "Skill";
};

export const getStudioSkillChangeNotification = (payload: any) =>
  ({
    message:
      payload?.action === "forget"
        ? `Forgot ${getSkillDisplayName(payload)}`
        : `Learned ${getSkillDisplayName(payload)}`,
    type: payload?.action === "forget" ? "warn" : "info",
  }) as const;
