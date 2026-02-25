export const isProduction = import.meta.env.PROD;
export const isPreprod = import.meta.env.PREPROD;
export const baseUrl = isPreprod ? "https://preprod.rpgjs.studio" : isProduction ? "https://rpgjs.studio" : "http://localhost:5173";
export const assetsUrl = isPreprod ? "https://assets.preprod.rpgjs.studio" : isProduction ? "https://assets.rpgjs.studio" : "http://localhost:5173/api/uploads";
export const apiUrl = baseUrl + "/api";