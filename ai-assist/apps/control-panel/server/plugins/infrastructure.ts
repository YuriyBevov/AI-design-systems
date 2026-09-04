import { closeInfrastructure } from "../utils/infrastructure";

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hookOnce("close", closeInfrastructure);
});
