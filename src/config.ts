import { rrImg } from "@/lib/img";

/** Прямой маршрут к Express API (/api/*). */
export const FN = (name: string): string => `/api/${name}`;

/** Базовый URL брендовых изображений (автоматически мапится на прямые ссылки). */
export const brandImage = (name: string): string => rrImg(`/logos/${name}.png`);

/** Логотип «Робот Рекрутер». */
export const RR_LOGO_URL = brandImage("RR-Logo");
