import { projectListResponseSchema } from "@ai-assist/contracts";

import { listProjects } from "../../../services/projects";

export default defineEventHandler(async (event) =>
  projectListResponseSchema.parse(await listProjects(event)),
);
