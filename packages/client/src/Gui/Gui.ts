import { Context, inject } from "@signe/di";
import { signal } from "canvasengine";
import { AbstractWebsocket, WebSocketToken } from "../services/AbstractSocket";
import { PrebuiltGui } from "../components/gui";

interface GuiOptions {
  name: string;
  component: any;
  display?: boolean;
  data?: any;
}

const throwError = (id: string) => {
  throw `The GUI named ${id} is non-existent. Please add the component in the gui property of the decorator @RpgClient`;
};

export class RpgGui {
  private webSocket: AbstractWebsocket;
  gui = signal<any>({});

  constructor(private context: Context) {
    this.webSocket = inject(context, WebSocketToken);
    this.add({
      name: "rpg-dialog",
      component: PrebuiltGui.Dialogbox,
    });
  }

  async _initialize() {
    this.webSocket.on("gui.open", (data: { guiId: string; data: any }) => {
      this.display(data.guiId, data.data);
    });

    this.webSocket.on("gui.exit", (guiId: string) => {
      this.hide(guiId);
    });
  }

  guiInteraction(guiId: string, name: string, data: any) {
    this.webSocket.emit("gui.interaction", {
      guiId,
      name,
      data,
    });
  }

  guiClose(guiId: string, data?: any) {
    this.webSocket.emit("gui.exit", {
      guiId,
      data,
    });
  }

  add(gui: GuiOptions) {
    this.gui()[gui.name] = {
      name: gui.name,
      component: gui.component,
      display: signal(gui.display || false),
      data: signal(gui.data || {}),
    };
  }

  get(id: string | GuiOptions) {
    if (typeof id != "string") {
      id = id.name;
    }
    return this.gui()[id];
  }

  exists(id: string): boolean {
    return !!this.get(id);
  }

  getAll() {
    return this.gui();
  }

  display(id: string, data = {}) {
    if (!this.exists(id)) {
      throw throwError(id);
    }
    this.get(id).data.set(data);
    this.get(id).display.set(true);
  }

  hide(id: string) {
    if (!this.exists(id)) {
      throw throwError(id);
    }
    this.get(id).display.set(false);
  }
}
