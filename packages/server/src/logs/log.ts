export class Log extends Error {
  readonly id: string;

  constructor(id: string, msg: string) {
    super(`[${id}] ${msg}`);
    this.name = "RpgLog";
    this.id = id;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
