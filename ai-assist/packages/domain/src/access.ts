export const projectRoles = ["viewer", "editor", "owner"] as const;
export type ProjectRole = (typeof projectRoles)[number];

const roleRank: Record<ProjectRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

export const canProjectRole = (actual: ProjectRole, required: ProjectRole): boolean =>
  roleRank[actual] >= roleRank[required];

export type ProjectScope = Readonly<{
  projectId: string;
  userId: string;
  role: ProjectRole;
}>;

export const createProjectScope = (input: ProjectScope): ProjectScope => Object.freeze({ ...input });
