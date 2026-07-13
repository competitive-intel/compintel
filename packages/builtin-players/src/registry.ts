import {
  BLOCK_FOUR_RANDOM_V1_KEY,
  blockFourRandomV1,
} from "./gomoku/block-four-random-v1.js";
import type { BuiltinPlayerImplementation } from "./types.js";

const IMPLEMENTATIONS = new Map<string, BuiltinPlayerImplementation>([
  [BLOCK_FOUR_RANDOM_V1_KEY, blockFourRandomV1],
]);

export function resolveBuiltinPlayer(
  gameSlug: string,
  implementationKey: string,
): BuiltinPlayerImplementation {
  const implementation = IMPLEMENTATIONS.get(implementationKey);
  if (implementation === undefined) {
    throw new Error(
      `unknown built-in player implementation: ${implementationKey}`,
    );
  }
  if (implementation.gameSlug !== gameSlug) {
    throw new Error(
      `built-in player ${implementationKey} does not support game ${gameSlug}`,
    );
  }
  return implementation;
}
