import { signal } from "@signe/reactive";
import { id, sync } from "@signe/sync";

export interface SkillData {
    name: string;
    description: string;
    spCost: number;
    hitRate: number;
    power: number;
    coefficient: Record<string, number>;
}

export class Skill {
    @id() id = signal('');
    @sync() name = signal('');
    @sync() description = signal('');

    constructor(data?: SkillData) {
        this.description.set(data?.description ?? '');
        this.name.set(data?.name ?? '');
    }
}
