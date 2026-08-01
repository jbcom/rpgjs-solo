export type ClientInputLockRelease = () => void;

/** Coordinates temporary input owners without overwriting legacy input state. */
export class ClientInputLockManager {
	private readonly owners = new Set<object>();

	acquire(owner: object = {}): ClientInputLockRelease {
		this.owners.add(owner);
		let released = false;
		return () => {
			if (released) return;
			released = true;
			this.owners.delete(owner);
		};
	}

	get active(): boolean {
		return this.owners.size > 0;
	}

	reset(): void {
		this.owners.clear();
	}
}
