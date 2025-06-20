import canvasengine from "@canvasengine/compiler";
import { replaceConfigImport } from "./replace-config-import";
import { serverPlugin } from "./server-plugin";

export function rpgjs({
  server
}) {
  return [
    canvasengine(),
    replaceConfigImport(),
    serverPlugin(server),
  ]
}