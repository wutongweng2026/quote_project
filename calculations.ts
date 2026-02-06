import { state } from './state';

export function calculateTotals() {
    if (state.appStatus !== 'ready') return { finalPrice: 0, appliedDiscountLabel: '无折扣' };
    const standardCost = Object.entries(state.selection).reduce((acc, [category, { model, quantity }]) => {
        if (model && quantity > 0) {
            const dataCategory = category.startsWith('硬盘') ? '硬盘' : category;
            const cost = state.priceData.prices[dataCategory]?.[model] ?? 0;
            return acc + (cost * quantity);
        }
        return acc;
    }, 0);

    const customCost = state.customItems.reduce((acc, item) => {
        if (item.model && item.quantity > 0) {
            const cost = state.priceData.prices[item.category]?.[item.model] ?? 0;
            return acc + (cost * item.quantity);
        }
        return acc;
    }, 0);
    
    const costTotal = standardCost + customCost;
    
    let appliedRate = 1.0;
    let appliedDiscountLabel = '无折扣';

    if (state.selectedDiscountId !== 'none') {
        // Manual Selection
        const selectedTier = state.priceData.tieredDiscounts?.find(t => t.id === state.selectedDiscountId);
        if (selectedTier) {
            appliedRate = selectedTier.rate / 10;
            appliedDiscountLabel = selectedTier.threshold > 0 
                ? `满 ${selectedTier.threshold} 件, 打 ${selectedTier.rate} 折`
                : `固定折扣: ${selectedTier.rate} 折`;
        }
    }

    const selectedMarkupPoint = state.priceData.markupPoints?.find(p => p.id === state.markupPoints);
    const markupValue = selectedMarkupPoint ? selectedMarkupPoint.value : 0;
    const priceBeforeDiscount = costTotal * (1 + markupValue / 100);
    let finalPrice = priceBeforeDiscount * appliedRate - state.specialDiscount;
    finalPrice = Math.max(0, finalPrice);
    if (finalPrice > 0) {
        const intPrice = Math.floor(finalPrice);
        const lastTwoDigits = intPrice % 100;
        finalPrice = (lastTwoDigits > 50) ? (Math.floor(intPrice / 100) * 100) + 99 : (Math.floor(intPrice / 100) * 100) + 50;
    }
    return { finalPrice, appliedDiscountLabel };
}

export function getFinalConfigText() {
    const parts = [
        ...Object.entries(state.selection).filter(([_, { model, quantity }]) => model && quantity > 0)
            .map(([_, { model, quantity }]) => `${model} * ${quantity}`),
        ...state.customItems.filter(item => item.model && item.quantity > 0)
            .map(item => `${item.model} * ${item.quantity}`)
    ];
    return parts.join(' | ');
}