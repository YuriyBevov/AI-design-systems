import { adhesiveProducts } from "./products-adhesive.js";
import { strappingProducts } from "./products-strapping.js";
import { specialProducts } from "./products-special.js";
import { stretchProducts, machineProducts } from "./products-other.js";
import { miscProducts } from "./products-misc.js";

export const products = [
  ...adhesiveProducts,
  ...strappingProducts,
  ...specialProducts,
  ...stretchProducts,
  ...machineProducts,
  ...miscProducts,
];