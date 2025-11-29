export const KeyboardControls = "KeyboardControlsToken";

export function provideKeyboardControls() {
  return {
    provide: KeyboardControls,
    useValue: null,
  };
}