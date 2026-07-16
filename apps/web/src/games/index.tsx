import type { GameReplay } from "@compintel/contracts";

import { GomokuReplayBoard } from "./gomoku";
import { QuoridorReplayBoard } from "./quoridor";

export function GameReplayBoard({ replay }: { replay: GameReplay }) {
  switch (replay.gameSlug) {
    case "gomoku":
      return <GomokuReplayBoard replay={replay} />;
    case "quoridor":
      return <QuoridorReplayBoard replay={replay} />;
  }
}
