import { signal } from "@signe/reactive";
import { id, sync } from "@signe/sync";

export interface SkillData {
    id: string;
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
    description = signal('');
    spCost = signal(0);
    hitRate = signal(0);
    power = signal(0);
    coefficient = signal({});

    constructor(data?: SkillData) {
        this.id.set(data?.id ?? '');
        this.name.set(data?.name ?? '');
        this.description.set(data?.description ?? '');
        this.spCost.set(data?.spCost ?? 0);
        this.hitRate.set(data?.hitRate ?? 0);
        this.power.set(data?.power ?? 0);
        this.coefficient.set(data?.coefficient ?? {});
    }
}
