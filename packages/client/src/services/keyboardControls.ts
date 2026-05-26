import { KeyboardControls  } from "canvasengine";

export enum Control {
  Action = 'action',
  Attack = 'attack',
  Defense = 'defense',
  Skill = 'skill',
  Dash = 'dash',
  Back = 'back',
  Up = 1,
  Down = 3,
  Right = 2,
  Left = 4
}

export function provideKeyboardControls() {
  return {
    provide: 'KeyboardControls',
    useValue: null,
  };
}
