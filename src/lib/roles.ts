import type { Role } from "@/lib/repo/types";

/**
 * Role ranking. A role satisfies any requirement at or below its own level.
 * Kept free of server imports so client components can share the same rule.
 */
const RANK: Record<Role, number> = {
  visitor: 0,
  member: 1,
  moderator: 2,
  editor: 3,
  admin: 4,
};

export function atLeast(role: Role, minimum: Role) {
  return RANK[role] >= RANK[minimum];
}
