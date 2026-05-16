import { computed } from "canvasengine";

interface MatchResult {
    property: string;
    fullMatch: string;
    index: number;
}

const readSignal = (value: any) => typeof value === 'function' ? value() : value;
const DYNAMIC_VALUE_PATTERN = /\{([^}]+)\}/g;

const hasDynamicValue = (value: any) => {
    value = readSignal(value);
    if (typeof value !== 'string') return false;
    DYNAMIC_VALUE_PATTERN.lastIndex = 0;
    return DYNAMIC_VALUE_PATTERN.test(value);
};

const resolveDynamicSnapshot = (value: any, object?: any): any => {
    value = readSignal(value);

    if (Array.isArray(value)) {
        return value.map((entry) => resolveDynamicSnapshot(entry, object));
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [key, resolveDynamicSnapshot(entry, object)])
        );
    }

    return resolveDynamicValue(value, object);
};

export const getDynamicValue = (property: string, object?: any) => {
    try {
        const propertyPath = property.split('.');
        let currentValue = object;

        for (let j = 0; j < propertyPath.length; j++) {
            let prop = propertyPath[j];

            currentValue = readSignal(currentValue);

            if (j === 0) {
                if (prop === 'hp') prop = 'hpSignal';
                if (prop === 'sp') prop = 'spSignal';
                if (prop === 'param') prop = '_param';
                if (prop === 'name' && currentValue && typeof currentValue === 'object' && '_name' in currentValue) {
                    prop = '_name';
                }
            }

            if (currentValue && typeof currentValue === 'object' && prop in currentValue) {
                currentValue = currentValue[prop];
            } else {
                return undefined;
            }
        }

        return readSignal(currentValue);
    } catch (error) {
        return undefined;
    }
};

export const resolveDynamicValue = (value: any, object?: any): any => {
    value = readSignal(value);

    if (typeof value !== 'string') {
        return value;
    }

    return value.replace(DYNAMIC_VALUE_PATTERN, (fullMatch, property) => {
        const propertyValue = getDynamicValue(property, object);
        if (propertyValue == null && property.startsWith('$')) return fullMatch;
        return propertyValue != null ? String(propertyValue) : '';
    });
};

const resolveDynamicProp = (value: any, object?: any): any => {
    if (Array.isArray(value) || (value && typeof value === 'object' && typeof value !== 'function')) {
        return computed(() => resolveDynamicSnapshot(value, object));
    }

    if (typeof value === 'function' || hasDynamicValue(value)) {
        return computed(() => resolveDynamicValue(value, object));
    }

    return value;
};

export const resolveDynamicProps = (props: any, object?: any): any => {
    props = readSignal(props);

    if (Array.isArray(props)) {
        return computed(() => resolveDynamicSnapshot(props, object));
    }

    if (props && typeof props === 'object') {
        return Object.fromEntries(
            Object.entries(props).map(([key, value]) => [key, resolveDynamicProp(value, object)])
        );
    }

    return resolveDynamicProp(props, object);
};

export const parseDynamicValue = (value: any, object?: any) => {
    if (typeof value !== 'string') {
        return computed(() => String(value ?? ''));
    }

    // Find all dynamic references like {propertyName}
    const matches: MatchResult[] = [];
    let match;

    DYNAMIC_VALUE_PATTERN.lastIndex = 0;
    while ((match = DYNAMIC_VALUE_PATTERN.exec(value)) !== null) {
        matches.push({
            property: match[1],
            fullMatch: match[0],
            index: match.index!
        });
    }

    // If no dynamic references found, return simple computed
    if (matches.length === 0) {
        return computed(() => value);
    }

    // Create computed that tracks all referenced signals
    return computed(() => {
        let result = value;
        
        // Replace from end to start to preserve indices
        for (let i = matches.length - 1; i >= 0; i--) {
            const { property, fullMatch } = matches[i];
            
            const currentValue = getDynamicValue(property, object);
            const propertyValue = currentValue != null ? String(currentValue) : property.startsWith('$') ? fullMatch : '';
            
            result = result.replace(fullMatch, propertyValue);
        }
        
        return result;
    });
};
