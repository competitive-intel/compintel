import { gomokuCatalog } from "./gomoku.js";
import { quoridorCatalog } from "./quoridor.js";

export const GAME_CATALOGS = [
  { slug: "gomoku", catalog: gomokuCatalog },
  { slug: "quoridor", catalog: quoridorCatalog },
] as const;
