import { computed } from "canvasengine";

interface MatchResult {
    property: string;
    fullMatch: string;
    index: number;
}

const readSignal = (value: any) => typeof value === 'function' ? value() : value;

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

    const pattern = /\{([^}]+)\}/g;

    return value.replace(pattern, (_fullMatch, property) => {
        const propertyValue = getDynamicValue(property, object);
        return propertyValue != null ? String(propertyValue) : '';
    });
};

export const resolveDynamicProps = (props: any, object?: any): any => {
    props = readSignal(props);

    if (Array.isArray(props)) {
        return props.map((value) => resolveDynamicProps(value, object));
    }

    if (props && typeof props === 'object') {
        return Object.fromEntries(
            Object.entries(props).map(([key, value]) => [key, resolveDynamicProps(value, object)])
        );
    }

    return resolveDynamicValue(props, object);
};

export const parseDynamicValue = (value: any, object?: any) => {
    if (typeof value !== 'string') {
        return computed(() => String(value ?? ''));
    }

    // Find all dynamic references like {propertyName}
    const pattern = /\{([^}]+)\}/g;
    const matches: MatchResult[] = [];
    let match;
    
    while ((match = pattern.exec(value)) !== null) {
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
            const propertyValue = currentValue != null ? String(currentValue) : '';
            
            result = result.replace(fullMatch, propertyValue);
        }
        
        return result;
    });
};
