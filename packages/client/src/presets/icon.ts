export const IconPreset = (options: {
    image: string;
    framesWidth: number;
    framesHeight: number;
    id: string;
}) => {
    return {
        textures: {
            default: {
                animations: () => [
                    [{ time: 0, frameX: 0, frameY: 0 }]
                ]
            }
        },
        ...options
    }
}